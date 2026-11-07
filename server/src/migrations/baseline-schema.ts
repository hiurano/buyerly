// `pg_dump --schema-only --no-owner --no-privileges` of a database Alembic
// migrated to 0054_drop_unused_tables (#611 stage 5), without its session
// SETs and comments. Generated once: from now on the schema changes through
// new migrations, never here. CI (scripts/ci_migration_parity.sh) proves an
// empty database migrated with it dumps exactly as Alembic's did.
export const BASELINE_SCHEMA = `
-- SQL functions name tables created further down.
SET LOCAL check_function_bodies = false;

CREATE FUNCTION public.enforce_rule_group_item_workspace() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
                DECLARE
                    group_workspace INTEGER;
                    preset_workspace INTEGER;
                BEGIN
                    SELECT workspace_id INTO group_workspace
                    FROM rule_groups WHERE id = NEW.group_id;
                    SELECT workspace_id INTO preset_workspace
                    FROM rule_presets WHERE id = NEW.preset_id;
                    IF group_workspace IS NULL
                       OR preset_workspace IS NULL
                       OR group_workspace <> preset_workspace THEN
                        RAISE EXCEPTION 'rule group and preset must share workspace';
                    END IF;
                    RETURN NEW;
                END;
                $$;

CREATE FUNCTION public.sync_log_account_groups(account_pk integer, ws integer) RETURNS text[]
    LANGUAGE sql STABLE
    AS $$
    SELECT CASE WHEN count(*) = 0 THEN ARRAY['workspace:' || ws || ':members']
                ELSE array_agg('team:' || ta.team_id ORDER BY ta.team_id) END
    FROM team_accounts ta JOIN teams t ON t.id = ta.team_id
    WHERE ta.account_id = account_pk AND t.deleted_at IS NULL
$$;

CREATE FUNCTION public.sync_log_assign_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(504000504);
    UPDATE sync_actions SET sync_id = nextval('sync_actions_sync_id_seq') WHERE id = NEW.id;
    -- Delivered at commit, after the rows are visible; equal payloads in one transaction fold into one.
    PERFORM pg_notify('sync_actions', '');
    RETURN NULL;
END
$$;

CREATE FUNCTION public.sync_log_groups(tbl text, rec jsonb) RETURNS text[]
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    groups text[];
BEGIN
    CASE tbl
    WHEN 'workspaces' THEN
        groups := ARRAY['workspace:' || (rec->>'id')];
    WHEN 'workspace_members', 'workspace_view_defaults', 'rule_groups' THEN
        groups := ARRAY['workspace:' || (rec->>'workspace_id')];
    WHEN 'users' THEN
        SELECT array_agg('workspace:' || m.workspace_id ORDER BY m.workspace_id) INTO groups
        FROM workspace_members m WHERE m.user_id = (rec->>'id')::integer;
    WHEN 'rule_presets' THEN
        groups := ARRAY['workspace:' || (rec->>'workspace_id') || ':members'];
    WHEN 'rule_group_items' THEN
        SELECT ARRAY['workspace:' || p.workspace_id || ':members'] INTO groups
        FROM rule_presets p WHERE p.id = (rec->>'preset_id')::integer;
    WHEN 'accounts' THEN
        groups := sync_log_account_groups((rec->>'id')::integer, (rec->>'workspace_id')::integer);
    WHEN 'teams' THEN
        groups := ARRAY['team:' || (rec->>'id')];
    WHEN 'team_members' THEN
        -- The member hears of their own membership even when it takes them off a private team.
        groups := ARRAY['team:' || (rec->>'team_id'), 'member:' || (rec->>'member_id')];
    WHEN 'team_documents' THEN
        groups := ARRAY['team:' || (rec->>'team_id')];
    WHEN 'team_accounts' THEN
        SELECT ARRAY['team:' || (rec->>'team_id')] || sync_log_account_groups(a.id, a.workspace_id) INTO groups
        FROM accounts a WHERE a.id = (rec->>'account_id')::integer;
        groups := coalesce(groups, ARRAY['team:' || (rec->>'team_id')]);
    WHEN 'audit_events' THEN
        IF coalesce(rec->>'account_id', '') <> '' THEN
            SELECT sync_log_account_groups(a.id, a.workspace_id) INTO groups
            FROM accounts a WHERE a.account_id = rec->>'account_id';
        END IF;
        groups := coalesce(groups, ARRAY['workspace:' || (rec->>'workspace_id') || ':members']);
    WHEN 'inbox_notification_states' THEN
        SELECT ARRAY['member:' || m.id] INTO groups
        FROM audit_events e JOIN workspace_members m ON m.workspace_id = e.workspace_id
        WHERE e.id = (rec->>'audit_event_id')::integer AND m.user_id = (rec->>'user_id')::integer;
    WHEN 'favorites', 'view_settings', 'account_notification_settings' THEN
        groups := ARRAY['member:' || (rec->>'member_id')];
    ELSE
        RAISE EXCEPTION 'sync_log_groups: % is not a synced table', tbl;
    END CASE;
    -- A legacy row with no workspace yields NULL groups: nobody receives it.
    RETURN array_remove(groups, NULL);
END
$$;

CREATE FUNCTION public.sync_log_record() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    model text := TG_ARGV[0];
    excluded text[] := TG_ARGV[1]::text[];
    archive_column text := TG_ARGV[2];
    private_columns text[] := TG_ARGV[3]::text[];
    rec jsonb;
    data jsonb;
    private_data jsonb := '{}';
    action text;
    groups text[];
BEGIN
    IF TG_OP = 'DELETE' THEN
        rec := to_jsonb(OLD);
        action := 'delete';
        data := '{}';
    ELSIF TG_OP = 'INSERT' THEN
        rec := to_jsonb(NEW);
        action := 'insert';
        data := rec - excluded - private_columns;
    ELSE
        rec := to_jsonb(NEW);
        action := 'update';
        SELECT coalesce(jsonb_object_agg(n.key, n.value), '{}') INTO data
        FROM jsonb_each(rec - excluded) n
        WHERE to_jsonb(OLD) -> n.key IS DISTINCT FROM n.value;
        SELECT coalesce(jsonb_object_agg(n.key, n.value), '{}') INTO private_data
        FROM jsonb_each(data) n WHERE n.key = ANY(private_columns);
        data := data - private_columns;
        IF archive_column <> '' AND data ? archive_column
           AND to_jsonb(OLD) ->> archive_column IS NULL AND rec ->> archive_column IS NOT NULL THEN
            action := 'archive';
        END IF;
    END IF;

    -- A member's own Inbox options go to them alone, the rest of the row to the workspace.
    IF private_data <> '{}' THEN
        INSERT INTO sync_actions (model, model_id, action, data, sync_groups)
        VALUES (model, rec->>'id', 'update', private_data, ARRAY['member:' || (rec->>'id')]);
    END IF;
    IF action = 'update' AND data = '{}' THEN
        RETURN coalesce(NEW, OLD);
    END IF;

    groups := sync_log_groups(TG_TABLE_NAME, rec);
    IF coalesce(cardinality(groups), 0) > 0 THEN
        INSERT INTO sync_actions (model, model_id, action, data, sync_groups)
        VALUES (model, rec->>'id', action, data, groups);
    END IF;
    -- BEFORE DELETE needs OLD back, or the delete would be skipped; AFTER triggers ignore it.
    RETURN coalesce(NEW, OLD);
END
$$;

CREATE TABLE public.account_health (
    id integer NOT NULL,
    workspace_id integer NOT NULL,
    account_pk integer NOT NULL,
    status character varying(16) DEFAULT 'unknown'::character varying NOT NULL,
    cause character varying(16) DEFAULT 'none'::character varying NOT NULL,
    signals jsonb DEFAULT '{}'::jsonb NOT NULL,
    consecutive_failures integer DEFAULT 0 NOT NULL,
    last_success_at timestamp with time zone,
    last_error_at timestamp with time zone,
    last_error_code character varying(64) DEFAULT ''::character varying NOT NULL,
    last_error_message text DEFAULT ''::text NOT NULL,
    last_checked_at timestamp with time zone DEFAULT now() NOT NULL,
    last_transition_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.account_health_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.account_health_id_seq OWNED BY public.account_health.id;

CREATE TABLE public.account_notification_settings (
    id integer NOT NULL,
    member_id integer NOT NULL,
    account_id character varying(64) NOT NULL,
    kind character varying(32) NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE SEQUENCE public.account_notification_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.account_notification_settings_id_seq OWNED BY public.account_notification_settings.id;

CREATE TABLE public.accounts (
    id integer NOT NULL,
    workspace_id integer,
    account_id character varying NOT NULL,
    name character varying NOT NULL,
    custom_name character varying NOT NULL,
    note text NOT NULL,
    access_token character varying DEFAULT ''::character varying,
    meta_connection_id integer,
    owner_user_id integer,
    batch_name character varying NOT NULL,
    currency character varying NOT NULL,
    timezone_name character varying NOT NULL,
    last_started_date character varying NOT NULL,
    last_day_start_date character varying NOT NULL,
    active_rules text NOT NULL,
    account_status integer NOT NULL,
    status_label character varying NOT NULL,
    rules_enabled boolean NOT NULL,
    is_active boolean NOT NULL,
    created_at timestamp with time zone NOT NULL,
    access_token_encrypted text DEFAULT ''::text,
    primary_result character varying DEFAULT ''::character varying NOT NULL,
    target_cost_per_result double precision,
    lead_user_id integer
);

CREATE SEQUENCE public.accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.accounts_id_seq OWNED BY public.accounts.id;

CREATE TABLE public.action_undo_states (
    id integer NOT NULL,
    original_event_id integer NOT NULL,
    owner_user_id integer,
    status character varying NOT NULL,
    correlation_id character varying NOT NULL,
    attempt_count integer NOT NULL,
    expected_state jsonb NOT NULL,
    desired_state jsonb NOT NULL,
    last_error text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE SEQUENCE public.action_undo_states_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.action_undo_states_id_seq OWNED BY public.action_undo_states.id;

CREATE TABLE public.adset_inventory_cache (
    account_id character varying NOT NULL,
    adsets_payload jsonb NOT NULL,
    version integer NOT NULL,
    fetched_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.analytics_entity_daily_facts (
    id bigint NOT NULL,
    workspace_id integer NOT NULL,
    account_id character varying NOT NULL,
    entity_level character varying(16) NOT NULL,
    entity_id character varying(64) NOT NULL,
    entity_name character varying(255) DEFAULT ''::character varying NOT NULL,
    parent_entity_id character varying(64) DEFAULT ''::character varying NOT NULL,
    date character varying(10) NOT NULL,
    currency character varying(10) DEFAULT 'UNKNOWN'::character varying NOT NULL,
    spend double precision DEFAULT '0'::double precision NOT NULL,
    impressions integer DEFAULT 0 NOT NULL,
    reach integer DEFAULT 0 NOT NULL,
    frequency double precision DEFAULT '0'::double precision NOT NULL,
    cpm double precision DEFAULT '0'::double precision NOT NULL,
    clicks integer DEFAULT 0 NOT NULL,
    unique_clicks integer DEFAULT 0 NOT NULL,
    link_clicks integer DEFAULT 0 NOT NULL,
    outbound_clicks integer DEFAULT 0 NOT NULL,
    landing_page_views integer DEFAULT 0 NOT NULL,
    cpc double precision DEFAULT '0'::double precision NOT NULL,
    cpc_link double precision,
    ctr double precision DEFAULT '0'::double precision NOT NULL,
    ctr_link double precision,
    ctr_outbound double precision,
    leads integer DEFAULT 0 NOT NULL,
    registrations integer DEFAULT 0 NOT NULL,
    purchases integer DEFAULT 0 NOT NULL,
    cost_per_lead double precision,
    cost_per_registration double precision,
    cost_per_purchase double precision,
    cost_per_landing_page_view double precision,
    raw_actions jsonb DEFAULT '[]'::jsonb NOT NULL,
    status character varying(32) DEFAULT 'UNKNOWN'::character varying NOT NULL,
    effective_status character varying(32) DEFAULT 'UNKNOWN'::character varying NOT NULL,
    daily_budget double precision DEFAULT '0'::double precision NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.analytics_entity_daily_facts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.analytics_entity_daily_facts_id_seq OWNED BY public.analytics_entity_daily_facts.id;

CREATE TABLE public.app_settings (
    id integer NOT NULL,
    poll_interval_minutes integer NOT NULL,
    critical_rule_interval_minutes integer NOT NULL,
    stop_confirmation_minutes integer NOT NULL,
    inventory_cache_minutes integer NOT NULL,
    account_health_interval_minutes integer NOT NULL,
    max_concurrent_accounts integer NOT NULL,
    max_concurrent_actions integer NOT NULL,
    usage_soft_limit_percent integer NOT NULL,
    usage_hard_limit_percent integer NOT NULL,
    adaptive_polling_enabled boolean NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE SEQUENCE public.app_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.app_settings_id_seq OWNED BY public.app_settings.id;

CREATE TABLE public.audit_events (
    id integer NOT NULL,
    workspace_id integer,
    owner_user_id integer,
    actor_type character varying NOT NULL,
    actor_id character varying NOT NULL,
    category character varying NOT NULL,
    event_type character varying NOT NULL,
    status character varying NOT NULL,
    account_id character varying NOT NULL,
    account_name character varying NOT NULL,
    adset_id character varying NOT NULL,
    adset_name character varying NOT NULL,
    rule_id integer,
    rule_name character varying NOT NULL,
    action character varying NOT NULL,
    message text NOT NULL,
    before_state jsonb NOT NULL,
    after_state jsonb NOT NULL,
    details jsonb NOT NULL,
    correlation_id character varying NOT NULL,
    reverts_event_id integer,
    duration_ms integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    entity_level character varying(16) DEFAULT 'adset'::character varying NOT NULL,
    entity_id character varying(64) DEFAULT ''::character varying NOT NULL,
    entity_name character varying DEFAULT ''::character varying NOT NULL
);

CREATE SEQUENCE public.audit_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.audit_events_id_seq OWNED BY public.audit_events.id;

CREATE TABLE public.automation_runtime_states (
    state_key character varying NOT NULL,
    payload jsonb NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE TABLE public.automation_schedule_states (
    id integer NOT NULL,
    state_key character varying NOT NULL,
    owner_user_id integer,
    account_id character varying NOT NULL,
    rule_key character varying NOT NULL,
    last_checked_at double precision NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE SEQUENCE public.automation_schedule_states_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.automation_schedule_states_id_seq OWNED BY public.automation_schedule_states.id;

CREATE TABLE public.deleted_items (
    id integer NOT NULL,
    workspace_id integer NOT NULL,
    kind character varying NOT NULL,
    entity_id integer NOT NULL,
    name character varying DEFAULT ''::character varying NOT NULL,
    snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    deleted_by_user_id integer,
    deleted_at timestamp with time zone NOT NULL
);

CREATE SEQUENCE public.deleted_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.deleted_items_id_seq OWNED BY public.deleted_items.id;

CREATE TABLE public.desktop_push_subscriptions (
    id integer NOT NULL,
    member_id integer NOT NULL,
    web_session_id character varying(36) NOT NULL,
    endpoint text NOT NULL,
    p256dh character varying NOT NULL,
    auth character varying NOT NULL,
    user_agent character varying(500) NOT NULL,
    created_at timestamp with time zone NOT NULL
);

CREATE SEQUENCE public.desktop_push_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.desktop_push_subscriptions_id_seq OWNED BY public.desktop_push_subscriptions.id;

CREATE TABLE public.email_verification_codes (
    id integer NOT NULL,
    email character varying NOT NULL,
    code character varying(10) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    is_used boolean NOT NULL,
    failed_attempts integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    code_hash character varying(64) NOT NULL,
    purpose character varying(32) NOT NULL,
    scope character varying(320) NOT NULL,
    delivered_at timestamp with time zone,
    link_token_hash character varying(64),
    invite_id integer
);

CREATE SEQUENCE public.email_verification_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.email_verification_codes_id_seq OWNED BY public.email_verification_codes.id;

CREATE TABLE public.favorites (
    id integer NOT NULL,
    member_id integer NOT NULL,
    kind character varying(16) NOT NULL,
    path character varying(300) NOT NULL,
    title character varying(200) NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone NOT NULL
);

CREATE SEQUENCE public.favorites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.favorites_id_seq OWNED BY public.favorites.id;

CREATE TABLE public.inbox_email_deliveries (
    id integer NOT NULL,
    user_id integer NOT NULL,
    audit_event_id integer NOT NULL,
    email character varying NOT NULL,
    created_at timestamp with time zone NOT NULL,
    sent_at timestamp with time zone
);

CREATE SEQUENCE public.inbox_email_deliveries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.inbox_email_deliveries_id_seq OWNED BY public.inbox_email_deliveries.id;

CREATE TABLE public.inbox_notification_states (
    id integer NOT NULL,
    user_id integer NOT NULL,
    audit_event_id integer NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    snoozed_until timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.inbox_notification_states_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.inbox_notification_states_id_seq OWNED BY public.inbox_notification_states.id;

CREATE TABLE public.inbox_push_deliveries (
    id integer NOT NULL,
    user_id integer NOT NULL,
    audit_event_id integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    sent_at timestamp with time zone
);

CREATE SEQUENCE public.inbox_push_deliveries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.inbox_push_deliveries_id_seq OWNED BY public.inbox_push_deliveries.id;

CREATE TABLE public.inbox_telegram_deliveries (
    id integer NOT NULL,
    user_id integer NOT NULL,
    audit_event_id integer NOT NULL,
    chat_id bigint NOT NULL,
    created_at timestamp with time zone NOT NULL,
    sent_at timestamp with time zone
);

CREATE SEQUENCE public.inbox_telegram_deliveries_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.inbox_telegram_deliveries_id_seq OWNED BY public.inbox_telegram_deliveries.id;

CREATE TABLE public.meta_connection_assets (
    id integer NOT NULL,
    connection_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    meta_account_id character varying NOT NULL,
    name character varying NOT NULL,
    business_id character varying NOT NULL,
    business_name character varying NOT NULL,
    account_status integer NOT NULL,
    currency character varying NOT NULL,
    timezone_name character varying NOT NULL,
    discovered_at timestamp with time zone NOT NULL
);

CREATE SEQUENCE public.meta_connection_assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.meta_connection_assets_id_seq OWNED BY public.meta_connection_assets.id;

CREATE TABLE public.meta_connection_invites (
    id integer NOT NULL,
    workspace_id integer NOT NULL,
    created_by_user_id integer,
    token_hash character varying(64) NOT NULL,
    token_prefix character varying(20) NOT NULL,
    label character varying(255) DEFAULT ''::character varying NOT NULL,
    status character varying(32) DEFAULT 'pending'::character varying NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    connected_meta_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.meta_connection_invites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.meta_connection_invites_id_seq OWNED BY public.meta_connection_invites.id;

CREATE TABLE public.meta_connections (
    id integer NOT NULL,
    workspace_id integer NOT NULL,
    owner_user_id integer NOT NULL,
    provider_user_id character varying NOT NULL,
    provider_user_name character varying NOT NULL,
    access_token_encrypted text NOT NULL,
    granted_scopes jsonb NOT NULL,
    token_expires_at timestamp with time zone,
    status character varying NOT NULL,
    last_error text NOT NULL,
    last_validated_at timestamp with time zone,
    connected_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE SEQUENCE public.meta_connections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.meta_connections_id_seq OWNED BY public.meta_connections.id;

CREATE TABLE public.meta_oauth_states (
    id integer NOT NULL,
    state_hash character varying NOT NULL,
    owner_user_id integer NOT NULL,
    return_path character varying NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    reconnect_connection_id integer,
    workspace_id integer NOT NULL,
    invite_id integer
);

CREATE SEQUENCE public.meta_oauth_states_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.meta_oauth_states_id_seq OWNED BY public.meta_oauth_states.id;

CREATE TABLE public.rule_entity_states (
    id integer NOT NULL,
    workspace_id integer NOT NULL,
    account_id character varying NOT NULL,
    rule_id integer NOT NULL,
    entity_level character varying NOT NULL,
    entity_id character varying NOT NULL,
    entity_name character varying DEFAULT ''::character varying NOT NULL,
    campaign_id character varying DEFAULT ''::character varying NOT NULL,
    state character varying NOT NULL,
    detail text DEFAULT ''::text NOT NULL,
    wait_until timestamp with time zone,
    yielded_to_rule_id integer,
    yielded_to_rule_name character varying DEFAULT ''::character varying NOT NULL,
    checked_at timestamp with time zone NOT NULL,
    acted_at timestamp with time zone
);

CREATE SEQUENCE public.rule_entity_states_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.rule_entity_states_id_seq OWNED BY public.rule_entity_states.id;

CREATE TABLE public.rule_examples_bootstrap (
    id integer NOT NULL,
    owner_user_id integer NOT NULL,
    version integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    workspace_id integer NOT NULL
);

CREATE SEQUENCE public.rule_examples_bootstrap_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.rule_examples_bootstrap_id_seq OWNED BY public.rule_examples_bootstrap.id;

CREATE TABLE public.rule_execution_states (
    id integer NOT NULL,
    execution_key character varying NOT NULL,
    owner_user_id integer,
    account_id character varying NOT NULL,
    adset_id character varying NOT NULL,
    rule_key character varying NOT NULL,
    action character varying NOT NULL,
    status character varying NOT NULL,
    correlation_id character varying NOT NULL,
    last_attempt_at double precision NOT NULL,
    last_success_at double precision,
    before_state jsonb NOT NULL,
    after_state jsonb NOT NULL,
    details jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    entity_level character varying(16) DEFAULT 'adset'::character varying NOT NULL,
    entity_id character varying(64) DEFAULT ''::character varying NOT NULL
);

CREATE SEQUENCE public.rule_execution_states_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.rule_execution_states_id_seq OWNED BY public.rule_execution_states.id;

CREATE TABLE public.rule_group_items (
    id integer NOT NULL,
    group_id integer NOT NULL,
    preset_id integer NOT NULL,
    "position" integer NOT NULL,
    created_at timestamp with time zone NOT NULL
);

CREATE SEQUENCE public.rule_group_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.rule_group_items_id_seq OWNED BY public.rule_group_items.id;

CREATE TABLE public.rule_groups (
    id integer NOT NULL,
    workspace_id integer,
    owner_user_id integer,
    name character varying NOT NULL,
    description character varying NOT NULL,
    "position" integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    icon character varying(32) DEFAULT 'custom'::character varying NOT NULL,
    color character varying(7) DEFAULT '#95a2b3'::character varying NOT NULL
);

CREATE SEQUENCE public.rule_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.rule_groups_id_seq OWNED BY public.rule_groups.id;

CREATE TABLE public.rule_presets (
    id integer NOT NULL,
    workspace_id integer,
    owner_user_id integer,
    name character varying NOT NULL,
    action character varying NOT NULL,
    conditions jsonb NOT NULL,
    condition_logic character varying NOT NULL,
    cooldown_minutes integer NOT NULL,
    check_interval_minutes integer NOT NULL,
    notify_tg boolean NOT NULL,
    budget_change_percent double precision NOT NULL,
    budget_max_daily double precision NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    level character varying(16) DEFAULT 'adset'::character varying NOT NULL
);

CREATE SEQUENCE public.rule_presets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.rule_presets_id_seq OWNED BY public.rule_presets.id;

CREATE TABLE public.stopped_adsets (
    id integer NOT NULL,
    account_id character varying NOT NULL,
    adset_id character varying NOT NULL,
    adset_name character varying NOT NULL,
    stop_spend double precision NOT NULL,
    stop_leads integer NOT NULL,
    stop_registrations integer NOT NULL,
    is_resolved boolean NOT NULL,
    stopped_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE SEQUENCE public.stopped_adsets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.stopped_adsets_id_seq OWNED BY public.stopped_adsets.id;

CREATE TABLE public.summary_snapshots (
    id integer NOT NULL,
    workspace_id integer,
    owner_user_id integer,
    period character varying NOT NULL,
    payload jsonb NOT NULL,
    schema_version integer NOT NULL,
    generated_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL
);

CREATE SEQUENCE public.summary_snapshots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.summary_snapshots_id_seq OWNED BY public.summary_snapshots.id;

CREATE TABLE public.sync_actions (
    id bigint NOT NULL,
    sync_id bigint,
    model character varying(64) NOT NULL,
    model_id character varying(64) NOT NULL,
    action character varying(16) NOT NULL,
    data jsonb NOT NULL,
    sync_groups text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE public.sync_actions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.sync_actions_id_seq OWNED BY public.sync_actions.id;

CREATE SEQUENCE public.sync_actions_sync_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

CREATE TABLE public.team_accounts (
    id integer NOT NULL,
    team_id integer NOT NULL,
    account_id integer NOT NULL,
    created_at timestamp with time zone NOT NULL
);

CREATE SEQUENCE public.team_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.team_accounts_id_seq OWNED BY public.team_accounts.id;

CREATE TABLE public.team_documents (
    id integer NOT NULL,
    team_id integer NOT NULL,
    title character varying(255) DEFAULT ''::character varying NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    created_by_user_id integer,
    updated_by_user_id integer,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE SEQUENCE public.team_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.team_documents_id_seq OWNED BY public.team_documents.id;

CREATE TABLE public.team_members (
    id integer NOT NULL,
    team_id integer NOT NULL,
    member_id integer NOT NULL,
    joined_at timestamp with time zone NOT NULL,
    is_owner boolean DEFAULT false NOT NULL
);

CREATE SEQUENCE public.team_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.team_members_id_seq OWNED BY public.team_members.id;

CREATE TABLE public.teams (
    id integer NOT NULL,
    workspace_id integer NOT NULL,
    name character varying(48) NOT NULL,
    key character varying(7) NOT NULL,
    description character varying(255) DEFAULT ''::character varying NOT NULL,
    created_by_user_id integer,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    retired_at timestamp with time zone,
    deleted_at timestamp with time zone,
    private boolean DEFAULT false NOT NULL
);

CREATE SEQUENCE public.teams_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.teams_id_seq OWNED BY public.teams.id;

CREATE TABLE public.telegram_connections (
    id integer NOT NULL,
    member_id integer NOT NULL,
    chat_id bigint NOT NULL,
    username character varying,
    first_name character varying,
    connected_at timestamp with time zone NOT NULL,
    delivery_error character varying,
    delivery_error_at timestamp with time zone
);

CREATE SEQUENCE public.telegram_connections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.telegram_connections_id_seq OWNED BY public.telegram_connections.id;

CREATE TABLE public.telegram_link_tokens (
    id integer NOT NULL,
    member_id integer NOT NULL,
    token_hash character varying(64) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL
);

CREATE SEQUENCE public.telegram_link_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.telegram_link_tokens_id_seq OWNED BY public.telegram_link_tokens.id;

CREATE TABLE public.users (
    id integer NOT NULL,
    telegram_id character varying,
    username character varying NOT NULL,
    full_name character varying NOT NULL,
    first_name character varying NOT NULL,
    last_name character varying NOT NULL,
    email character varying,
    avatar_url character varying NOT NULL,
    onboarding_step character varying NOT NULL,
    onboarding_completed boolean NOT NULL,
    auth_token character varying,
    role character varying NOT NULL,
    is_approved boolean NOT NULL,
    active_workspace_id integer,
    created_at timestamp with time zone NOT NULL,
    email_verified_at timestamp with time zone,
    unconfirmed_email character varying,
    title character varying(128) DEFAULT ''::character varying NOT NULL
);

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;

CREATE TABLE public.view_settings (
    id integer NOT NULL,
    member_id integer NOT NULL,
    view_key character varying(64) NOT NULL,
    settings jsonb NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE SEQUENCE public.view_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.view_settings_id_seq OWNED BY public.view_settings.id;

CREATE TABLE public.web_sessions (
    id character varying(36) NOT NULL,
    user_id integer NOT NULL,
    token_hash character varying(64) NOT NULL,
    csrf_hash character varying(64) NOT NULL,
    user_agent character varying(500) NOT NULL,
    ip_address character varying(64) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    last_seen_at timestamp with time zone NOT NULL,
    rotated_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    location character varying(128) DEFAULT ''::character varying NOT NULL
);

CREATE TABLE public.workspace_invites (
    id integer NOT NULL,
    workspace_id integer NOT NULL,
    token character varying NOT NULL,
    email character varying,
    role character varying NOT NULL,
    inviter_user_id integer,
    status character varying NOT NULL,
    max_uses integer NOT NULL,
    used_count integer NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE SEQUENCE public.workspace_invites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.workspace_invites_id_seq OWNED BY public.workspace_invites.id;

CREATE TABLE public.workspace_members (
    id integer NOT NULL,
    workspace_id integer NOT NULL,
    user_id integer NOT NULL,
    role character varying NOT NULL,
    joined_at timestamp with time zone NOT NULL,
    inbox_read_before timestamp with time zone DEFAULT now() NOT NULL,
    inbox_deleted_before timestamp with time zone,
    inbox_display jsonb,
    notification_channels jsonb
);

CREATE SEQUENCE public.workspace_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.workspace_members_id_seq OWNED BY public.workspace_members.id;

CREATE TABLE public.workspace_support_grants (
    id integer NOT NULL,
    workspace_id integer NOT NULL,
    user_id integer NOT NULL,
    role character varying DEFAULT 'admin'::character varying NOT NULL,
    reason text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone
);

CREATE SEQUENCE public.workspace_support_grants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.workspace_support_grants_id_seq OWNED BY public.workspace_support_grants.id;

CREATE TABLE public.workspace_view_defaults (
    id integer NOT NULL,
    workspace_id integer NOT NULL,
    view_key character varying(64) NOT NULL,
    settings jsonb NOT NULL,
    updated_by_user_id integer,
    updated_at timestamp with time zone NOT NULL
);

CREATE SEQUENCE public.workspace_view_defaults_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.workspace_view_defaults_id_seq OWNED BY public.workspace_view_defaults.id;

CREATE TABLE public.workspaces (
    id integer NOT NULL,
    name character varying NOT NULL,
    slug character varying NOT NULL,
    badge_text character varying NOT NULL,
    badge_color character varying NOT NULL,
    logo_url character varying NOT NULL,
    owner_user_id integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE SEQUENCE public.workspaces_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.workspaces_id_seq OWNED BY public.workspaces.id;

ALTER TABLE ONLY public.account_health ALTER COLUMN id SET DEFAULT nextval('public.account_health_id_seq'::regclass);

ALTER TABLE ONLY public.account_notification_settings ALTER COLUMN id SET DEFAULT nextval('public.account_notification_settings_id_seq'::regclass);

ALTER TABLE ONLY public.accounts ALTER COLUMN id SET DEFAULT nextval('public.accounts_id_seq'::regclass);

ALTER TABLE ONLY public.action_undo_states ALTER COLUMN id SET DEFAULT nextval('public.action_undo_states_id_seq'::regclass);

ALTER TABLE ONLY public.analytics_entity_daily_facts ALTER COLUMN id SET DEFAULT nextval('public.analytics_entity_daily_facts_id_seq'::regclass);

ALTER TABLE ONLY public.app_settings ALTER COLUMN id SET DEFAULT nextval('public.app_settings_id_seq'::regclass);

ALTER TABLE ONLY public.audit_events ALTER COLUMN id SET DEFAULT nextval('public.audit_events_id_seq'::regclass);

ALTER TABLE ONLY public.automation_schedule_states ALTER COLUMN id SET DEFAULT nextval('public.automation_schedule_states_id_seq'::regclass);

ALTER TABLE ONLY public.deleted_items ALTER COLUMN id SET DEFAULT nextval('public.deleted_items_id_seq'::regclass);

ALTER TABLE ONLY public.desktop_push_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.desktop_push_subscriptions_id_seq'::regclass);

ALTER TABLE ONLY public.email_verification_codes ALTER COLUMN id SET DEFAULT nextval('public.email_verification_codes_id_seq'::regclass);

ALTER TABLE ONLY public.favorites ALTER COLUMN id SET DEFAULT nextval('public.favorites_id_seq'::regclass);

ALTER TABLE ONLY public.inbox_email_deliveries ALTER COLUMN id SET DEFAULT nextval('public.inbox_email_deliveries_id_seq'::regclass);

ALTER TABLE ONLY public.inbox_notification_states ALTER COLUMN id SET DEFAULT nextval('public.inbox_notification_states_id_seq'::regclass);

ALTER TABLE ONLY public.inbox_push_deliveries ALTER COLUMN id SET DEFAULT nextval('public.inbox_push_deliveries_id_seq'::regclass);

ALTER TABLE ONLY public.inbox_telegram_deliveries ALTER COLUMN id SET DEFAULT nextval('public.inbox_telegram_deliveries_id_seq'::regclass);

ALTER TABLE ONLY public.meta_connection_assets ALTER COLUMN id SET DEFAULT nextval('public.meta_connection_assets_id_seq'::regclass);

ALTER TABLE ONLY public.meta_connection_invites ALTER COLUMN id SET DEFAULT nextval('public.meta_connection_invites_id_seq'::regclass);

ALTER TABLE ONLY public.meta_connections ALTER COLUMN id SET DEFAULT nextval('public.meta_connections_id_seq'::regclass);

ALTER TABLE ONLY public.meta_oauth_states ALTER COLUMN id SET DEFAULT nextval('public.meta_oauth_states_id_seq'::regclass);

ALTER TABLE ONLY public.rule_entity_states ALTER COLUMN id SET DEFAULT nextval('public.rule_entity_states_id_seq'::regclass);

ALTER TABLE ONLY public.rule_examples_bootstrap ALTER COLUMN id SET DEFAULT nextval('public.rule_examples_bootstrap_id_seq'::regclass);

ALTER TABLE ONLY public.rule_execution_states ALTER COLUMN id SET DEFAULT nextval('public.rule_execution_states_id_seq'::regclass);

ALTER TABLE ONLY public.rule_group_items ALTER COLUMN id SET DEFAULT nextval('public.rule_group_items_id_seq'::regclass);

ALTER TABLE ONLY public.rule_groups ALTER COLUMN id SET DEFAULT nextval('public.rule_groups_id_seq'::regclass);

ALTER TABLE ONLY public.rule_presets ALTER COLUMN id SET DEFAULT nextval('public.rule_presets_id_seq'::regclass);

ALTER TABLE ONLY public.stopped_adsets ALTER COLUMN id SET DEFAULT nextval('public.stopped_adsets_id_seq'::regclass);

ALTER TABLE ONLY public.summary_snapshots ALTER COLUMN id SET DEFAULT nextval('public.summary_snapshots_id_seq'::regclass);

ALTER TABLE ONLY public.sync_actions ALTER COLUMN id SET DEFAULT nextval('public.sync_actions_id_seq'::regclass);

ALTER TABLE ONLY public.team_accounts ALTER COLUMN id SET DEFAULT nextval('public.team_accounts_id_seq'::regclass);

ALTER TABLE ONLY public.team_documents ALTER COLUMN id SET DEFAULT nextval('public.team_documents_id_seq'::regclass);

ALTER TABLE ONLY public.team_members ALTER COLUMN id SET DEFAULT nextval('public.team_members_id_seq'::regclass);

ALTER TABLE ONLY public.teams ALTER COLUMN id SET DEFAULT nextval('public.teams_id_seq'::regclass);

ALTER TABLE ONLY public.telegram_connections ALTER COLUMN id SET DEFAULT nextval('public.telegram_connections_id_seq'::regclass);

ALTER TABLE ONLY public.telegram_link_tokens ALTER COLUMN id SET DEFAULT nextval('public.telegram_link_tokens_id_seq'::regclass);

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);

ALTER TABLE ONLY public.view_settings ALTER COLUMN id SET DEFAULT nextval('public.view_settings_id_seq'::regclass);

ALTER TABLE ONLY public.workspace_invites ALTER COLUMN id SET DEFAULT nextval('public.workspace_invites_id_seq'::regclass);

ALTER TABLE ONLY public.workspace_members ALTER COLUMN id SET DEFAULT nextval('public.workspace_members_id_seq'::regclass);

ALTER TABLE ONLY public.workspace_support_grants ALTER COLUMN id SET DEFAULT nextval('public.workspace_support_grants_id_seq'::regclass);

ALTER TABLE ONLY public.workspace_view_defaults ALTER COLUMN id SET DEFAULT nextval('public.workspace_view_defaults_id_seq'::regclass);

ALTER TABLE ONLY public.workspaces ALTER COLUMN id SET DEFAULT nextval('public.workspaces_id_seq'::regclass);

ALTER TABLE ONLY public.account_health
    ADD CONSTRAINT account_health_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.account_notification_settings
    ADD CONSTRAINT account_notification_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.action_undo_states
    ADD CONSTRAINT action_undo_states_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.adset_inventory_cache
    ADD CONSTRAINT adset_inventory_cache_pkey PRIMARY KEY (account_id);

ALTER TABLE ONLY public.analytics_entity_daily_facts
    ADD CONSTRAINT analytics_entity_daily_facts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.automation_runtime_states
    ADD CONSTRAINT automation_runtime_states_pkey PRIMARY KEY (state_key);

ALTER TABLE ONLY public.automation_schedule_states
    ADD CONSTRAINT automation_schedule_states_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.deleted_items
    ADD CONSTRAINT deleted_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.desktop_push_subscriptions
    ADD CONSTRAINT desktop_push_subscriptions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.email_verification_codes
    ADD CONSTRAINT email_verification_codes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inbox_email_deliveries
    ADD CONSTRAINT inbox_email_deliveries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inbox_notification_states
    ADD CONSTRAINT inbox_notification_states_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inbox_push_deliveries
    ADD CONSTRAINT inbox_push_deliveries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.inbox_telegram_deliveries
    ADD CONSTRAINT inbox_telegram_deliveries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.meta_connection_assets
    ADD CONSTRAINT meta_connection_assets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.meta_connection_invites
    ADD CONSTRAINT meta_connection_invites_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.meta_connections
    ADD CONSTRAINT meta_connections_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.meta_oauth_states
    ADD CONSTRAINT meta_oauth_states_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.rule_entity_states
    ADD CONSTRAINT rule_entity_states_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.rule_examples_bootstrap
    ADD CONSTRAINT rule_examples_bootstrap_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.rule_execution_states
    ADD CONSTRAINT rule_execution_states_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.rule_group_items
    ADD CONSTRAINT rule_group_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.rule_groups
    ADD CONSTRAINT rule_groups_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.rule_presets
    ADD CONSTRAINT rule_presets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.stopped_adsets
    ADD CONSTRAINT stopped_adsets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.summary_snapshots
    ADD CONSTRAINT summary_snapshots_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sync_actions
    ADD CONSTRAINT sync_actions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sync_actions
    ADD CONSTRAINT sync_actions_sync_id_key UNIQUE (sync_id);

ALTER TABLE ONLY public.team_accounts
    ADD CONSTRAINT team_accounts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.team_documents
    ADD CONSTRAINT team_documents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.telegram_connections
    ADD CONSTRAINT telegram_connections_member_id_key UNIQUE (member_id);

ALTER TABLE ONLY public.telegram_connections
    ADD CONSTRAINT telegram_connections_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.telegram_link_tokens
    ADD CONSTRAINT telegram_link_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.telegram_link_tokens
    ADD CONSTRAINT telegram_link_tokens_token_hash_key UNIQUE (token_hash);

ALTER TABLE ONLY public.account_health
    ADD CONSTRAINT uq_account_health_account_pk UNIQUE (account_pk);

ALTER TABLE ONLY public.account_notification_settings
    ADD CONSTRAINT uq_account_notification_settings_member_kind UNIQUE (member_id, account_id, kind);

ALTER TABLE ONLY public.analytics_entity_daily_facts
    ADD CONSTRAINT uq_analytics_facts_ws_acc_level_entity_date UNIQUE (workspace_id, account_id, entity_level, entity_id, date);

ALTER TABLE ONLY public.desktop_push_subscriptions
    ADD CONSTRAINT uq_desktop_push_member_endpoint UNIQUE (member_id, endpoint);

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT uq_favorites_member_path UNIQUE (member_id, path);

ALTER TABLE ONLY public.inbox_email_deliveries
    ADD CONSTRAINT uq_inbox_email_user_event UNIQUE (user_id, audit_event_id);

ALTER TABLE ONLY public.inbox_push_deliveries
    ADD CONSTRAINT uq_inbox_push_user_event UNIQUE (user_id, audit_event_id);

ALTER TABLE ONLY public.inbox_notification_states
    ADD CONSTRAINT uq_inbox_state_user_event UNIQUE (user_id, audit_event_id);

ALTER TABLE ONLY public.inbox_telegram_deliveries
    ADD CONSTRAINT uq_inbox_telegram_user_event UNIQUE (user_id, audit_event_id);

ALTER TABLE ONLY public.meta_connection_assets
    ADD CONSTRAINT uq_meta_connection_asset_account UNIQUE (connection_id, meta_account_id);

ALTER TABLE ONLY public.meta_connection_invites
    ADD CONSTRAINT uq_meta_connection_invites_token_hash UNIQUE (token_hash);

ALTER TABLE ONLY public.meta_connections
    ADD CONSTRAINT uq_meta_connections_workspace_provider_user UNIQUE (workspace_id, provider_user_id);

ALTER TABLE ONLY public.rule_entity_states
    ADD CONSTRAINT uq_rule_entity_state UNIQUE (workspace_id, account_id, rule_id, entity_level, entity_id);

ALTER TABLE ONLY public.rule_examples_bootstrap
    ADD CONSTRAINT uq_rule_examples_ws_owner UNIQUE (workspace_id, owner_user_id);

ALTER TABLE ONLY public.rule_group_items
    ADD CONSTRAINT uq_rule_group_preset UNIQUE (group_id, preset_id);

ALTER TABLE ONLY public.team_accounts
    ADD CONSTRAINT uq_team_account UNIQUE (team_id, account_id);

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT uq_team_member UNIQUE (team_id, member_id);

ALTER TABLE ONLY public.view_settings
    ADD CONSTRAINT uq_view_settings_member_key UNIQUE (member_id, view_key);

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT uq_workspace_member_user UNIQUE (workspace_id, user_id);

ALTER TABLE ONLY public.workspace_view_defaults
    ADD CONSTRAINT uq_workspace_view_defaults_key UNIQUE (workspace_id, view_key);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.view_settings
    ADD CONSTRAINT view_settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.web_sessions
    ADD CONSTRAINT web_sessions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.web_sessions
    ADD CONSTRAINT web_sessions_token_hash_key UNIQUE (token_hash);

ALTER TABLE ONLY public.workspace_invites
    ADD CONSTRAINT workspace_invites_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workspace_support_grants
    ADD CONSTRAINT workspace_support_grants_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workspace_view_defaults
    ADD CONSTRAINT workspace_view_defaults_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);

CREATE INDEX ix_account_health_account_pk ON public.account_health USING btree (account_pk);

CREATE INDEX ix_account_health_cause ON public.account_health USING btree (cause);

CREATE INDEX ix_account_health_last_checked_at ON public.account_health USING btree (last_checked_at);

CREATE INDEX ix_account_health_last_error_at ON public.account_health USING btree (last_error_at);

CREATE INDEX ix_account_health_last_success_at ON public.account_health USING btree (last_success_at);

CREATE INDEX ix_account_health_status ON public.account_health USING btree (status);

CREATE INDEX ix_account_health_workspace_id ON public.account_health USING btree (workspace_id);

CREATE INDEX ix_account_health_workspace_status ON public.account_health USING btree (workspace_id, status);

CREATE INDEX ix_account_notification_settings_member_id ON public.account_notification_settings USING btree (member_id);

CREATE UNIQUE INDEX ix_accounts_account_id ON public.accounts USING btree (account_id);

CREATE INDEX ix_accounts_lead_user_id ON public.accounts USING btree (lead_user_id);

CREATE INDEX ix_accounts_meta_connection_id ON public.accounts USING btree (meta_connection_id);

CREATE INDEX ix_accounts_owner_user_id ON public.accounts USING btree (owner_user_id);

CREATE INDEX ix_accounts_workspace_id ON public.accounts USING btree (workspace_id);

CREATE INDEX ix_action_undo_states_correlation_id ON public.action_undo_states USING btree (correlation_id);

CREATE UNIQUE INDEX ix_action_undo_states_original_event_id ON public.action_undo_states USING btree (original_event_id);

CREATE INDEX ix_action_undo_states_owner_user_id ON public.action_undo_states USING btree (owner_user_id);

CREATE INDEX ix_action_undo_states_status ON public.action_undo_states USING btree (status);

CREATE INDEX ix_adset_inventory_cache_account_id ON public.adset_inventory_cache USING btree (account_id);

CREATE INDEX ix_adset_inventory_cache_expires_at ON public.adset_inventory_cache USING btree (expires_at);

CREATE INDEX ix_analytics_facts_acc_date ON public.analytics_entity_daily_facts USING btree (account_id, date);

CREATE INDEX ix_analytics_facts_account_id ON public.analytics_entity_daily_facts USING btree (account_id);

CREATE INDEX ix_analytics_facts_date ON public.analytics_entity_daily_facts USING btree (date);

CREATE INDEX ix_analytics_facts_entity_id ON public.analytics_entity_daily_facts USING btree (entity_id);

CREATE INDEX ix_analytics_facts_entity_level ON public.analytics_entity_daily_facts USING btree (entity_level);

CREATE INDEX ix_analytics_facts_parent_entity_id ON public.analytics_entity_daily_facts USING btree (parent_entity_id);

CREATE INDEX ix_analytics_facts_workspace_id ON public.analytics_entity_daily_facts USING btree (workspace_id);

CREATE INDEX ix_analytics_facts_ws_date_level ON public.analytics_entity_daily_facts USING btree (workspace_id, date, entity_level);

CREATE INDEX ix_analytics_facts_ws_parent_date ON public.analytics_entity_daily_facts USING btree (workspace_id, parent_entity_id, date);

CREATE INDEX ix_audit_events_account_id ON public.audit_events USING btree (account_id);

CREATE INDEX ix_audit_events_action ON public.audit_events USING btree (action);

CREATE INDEX ix_audit_events_actor_type ON public.audit_events USING btree (actor_type);

CREATE INDEX ix_audit_events_adset_id ON public.audit_events USING btree (adset_id);

CREATE INDEX ix_audit_events_category ON public.audit_events USING btree (category);

CREATE INDEX ix_audit_events_correlation_id ON public.audit_events USING btree (correlation_id);

CREATE INDEX ix_audit_events_created_at ON public.audit_events USING btree (created_at);

CREATE INDEX ix_audit_events_event_type ON public.audit_events USING btree (event_type);

CREATE INDEX ix_audit_events_owner_user_id ON public.audit_events USING btree (owner_user_id);

CREATE UNIQUE INDEX ix_audit_events_reverts_event_id ON public.audit_events USING btree (reverts_event_id);

CREATE INDEX ix_audit_events_rule_id ON public.audit_events USING btree (rule_id);

CREATE INDEX ix_audit_events_status ON public.audit_events USING btree (status);

CREATE INDEX ix_audit_events_workspace_id ON public.audit_events USING btree (workspace_id);

CREATE INDEX ix_automation_schedule_states_account_id ON public.automation_schedule_states USING btree (account_id);

CREATE INDEX ix_automation_schedule_states_owner_user_id ON public.automation_schedule_states USING btree (owner_user_id);

CREATE INDEX ix_automation_schedule_states_rule_key ON public.automation_schedule_states USING btree (rule_key);

CREATE UNIQUE INDEX ix_automation_schedule_states_state_key ON public.automation_schedule_states USING btree (state_key);

CREATE INDEX ix_deleted_items_deleted_at ON public.deleted_items USING btree (deleted_at);

CREATE INDEX ix_deleted_items_workspace_id ON public.deleted_items USING btree (workspace_id);

CREATE INDEX ix_desktop_push_subscriptions_endpoint ON public.desktop_push_subscriptions USING btree (endpoint);

CREATE INDEX ix_desktop_push_subscriptions_member_id ON public.desktop_push_subscriptions USING btree (member_id);

CREATE INDEX ix_desktop_push_subscriptions_web_session_id ON public.desktop_push_subscriptions USING btree (web_session_id);

CREATE INDEX ix_email_verification_codes_delivered_at ON public.email_verification_codes USING btree (delivered_at);

CREATE INDEX ix_email_verification_codes_email ON public.email_verification_codes USING btree (email);

CREATE INDEX ix_email_verification_codes_expires_at ON public.email_verification_codes USING btree (expires_at);

CREATE INDEX ix_email_verification_codes_invite_id ON public.email_verification_codes USING btree (invite_id);

CREATE UNIQUE INDEX ix_email_verification_codes_link_token_hash ON public.email_verification_codes USING btree (link_token_hash);

CREATE INDEX ix_email_verification_codes_scope ON public.email_verification_codes USING btree (scope);

CREATE INDEX ix_favorites_member_id ON public.favorites USING btree (member_id);

CREATE INDEX ix_inbox_email_deliveries_audit_event_id ON public.inbox_email_deliveries USING btree (audit_event_id);

CREATE INDEX ix_inbox_email_deliveries_user_id ON public.inbox_email_deliveries USING btree (user_id);

CREATE INDEX ix_inbox_notification_states_audit_event_id ON public.inbox_notification_states USING btree (audit_event_id);

CREATE INDEX ix_inbox_notification_states_user_id ON public.inbox_notification_states USING btree (user_id);

CREATE INDEX ix_inbox_push_deliveries_audit_event_id ON public.inbox_push_deliveries USING btree (audit_event_id);

CREATE INDEX ix_inbox_push_deliveries_user_id ON public.inbox_push_deliveries USING btree (user_id);

CREATE INDEX ix_inbox_telegram_deliveries_audit_event_id ON public.inbox_telegram_deliveries USING btree (audit_event_id);

CREATE INDEX ix_inbox_telegram_deliveries_user_id ON public.inbox_telegram_deliveries USING btree (user_id);

CREATE INDEX ix_meta_connection_assets_business_id ON public.meta_connection_assets USING btree (business_id);

CREATE INDEX ix_meta_connection_assets_connection_id ON public.meta_connection_assets USING btree (connection_id);

CREATE INDEX ix_meta_connection_assets_meta_account_id ON public.meta_connection_assets USING btree (meta_account_id);

CREATE INDEX ix_meta_connection_assets_owner_user_id ON public.meta_connection_assets USING btree (owner_user_id);

CREATE INDEX ix_meta_connection_invites_connected_meta_id ON public.meta_connection_invites USING btree (connected_meta_id);

CREATE INDEX ix_meta_connection_invites_created_by_user_id ON public.meta_connection_invites USING btree (created_by_user_id);

CREATE INDEX ix_meta_connection_invites_expires_at ON public.meta_connection_invites USING btree (expires_at);

CREATE INDEX ix_meta_connection_invites_status ON public.meta_connection_invites USING btree (status);

CREATE UNIQUE INDEX ix_meta_connection_invites_token_hash ON public.meta_connection_invites USING btree (token_hash);

CREATE INDEX ix_meta_connection_invites_workspace_id ON public.meta_connection_invites USING btree (workspace_id);

CREATE INDEX ix_meta_connections_owner_user_id ON public.meta_connections USING btree (owner_user_id);

CREATE INDEX ix_meta_connections_provider_user_id ON public.meta_connections USING btree (provider_user_id);

CREATE INDEX ix_meta_connections_status ON public.meta_connections USING btree (status);

CREATE INDEX ix_meta_connections_workspace_id ON public.meta_connections USING btree (workspace_id);

CREATE INDEX ix_meta_oauth_states_expires_at ON public.meta_oauth_states USING btree (expires_at);

CREATE INDEX ix_meta_oauth_states_invite_id ON public.meta_oauth_states USING btree (invite_id);

CREATE INDEX ix_meta_oauth_states_owner_user_id ON public.meta_oauth_states USING btree (owner_user_id);

CREATE INDEX ix_meta_oauth_states_reconnect_connection_id ON public.meta_oauth_states USING btree (reconnect_connection_id);

CREATE UNIQUE INDEX ix_meta_oauth_states_state_hash ON public.meta_oauth_states USING btree (state_hash);

CREATE INDEX ix_meta_oauth_states_workspace_id ON public.meta_oauth_states USING btree (workspace_id);

CREATE INDEX ix_rule_entity_states_account_id ON public.rule_entity_states USING btree (account_id);

CREATE INDEX ix_rule_entity_states_entity_id ON public.rule_entity_states USING btree (entity_id);

CREATE INDEX ix_rule_entity_states_rule_id ON public.rule_entity_states USING btree (rule_id);

CREATE INDEX ix_rule_entity_states_workspace_id ON public.rule_entity_states USING btree (workspace_id);

CREATE UNIQUE INDEX ix_rule_examples_bootstrap_owner_user_id ON public.rule_examples_bootstrap USING btree (owner_user_id);

CREATE INDEX ix_rule_examples_bootstrap_workspace_id ON public.rule_examples_bootstrap USING btree (workspace_id);

CREATE INDEX ix_rule_execution_states_account_id ON public.rule_execution_states USING btree (account_id);

CREATE INDEX ix_rule_execution_states_action ON public.rule_execution_states USING btree (action);

CREATE INDEX ix_rule_execution_states_adset_id ON public.rule_execution_states USING btree (adset_id);

CREATE INDEX ix_rule_execution_states_correlation_id ON public.rule_execution_states USING btree (correlation_id);

CREATE UNIQUE INDEX ix_rule_execution_states_execution_key ON public.rule_execution_states USING btree (execution_key);

CREATE INDEX ix_rule_execution_states_owner_user_id ON public.rule_execution_states USING btree (owner_user_id);

CREATE INDEX ix_rule_execution_states_rule_key ON public.rule_execution_states USING btree (rule_key);

CREATE INDEX ix_rule_execution_states_status ON public.rule_execution_states USING btree (status);

CREATE INDEX ix_rule_group_items_group_id ON public.rule_group_items USING btree (group_id);

CREATE INDEX ix_rule_group_items_preset_id ON public.rule_group_items USING btree (preset_id);

CREATE INDEX ix_rule_groups_owner_user_id ON public.rule_groups USING btree (owner_user_id);

CREATE INDEX ix_rule_groups_workspace_id ON public.rule_groups USING btree (workspace_id);

CREATE INDEX ix_rule_groups_workspace_position ON public.rule_groups USING btree (workspace_id, "position", id);

CREATE INDEX ix_rule_presets_owner_user_id ON public.rule_presets USING btree (owner_user_id);

CREATE INDEX ix_rule_presets_workspace_id ON public.rule_presets USING btree (workspace_id);

CREATE INDEX ix_stopped_adsets_account_id ON public.stopped_adsets USING btree (account_id);

CREATE UNIQUE INDEX ix_stopped_adsets_adset_id ON public.stopped_adsets USING btree (adset_id);

CREATE INDEX ix_summary_snapshots_created_at ON public.summary_snapshots USING btree (created_at);

CREATE INDEX ix_summary_snapshots_generated_at ON public.summary_snapshots USING btree (generated_at);

CREATE INDEX ix_summary_snapshots_owner_user_id ON public.summary_snapshots USING btree (owner_user_id);

CREATE INDEX ix_summary_snapshots_period ON public.summary_snapshots USING btree (period);

CREATE INDEX ix_summary_snapshots_user_period_created ON public.summary_snapshots USING btree (owner_user_id, period, created_at);

CREATE INDEX ix_summary_snapshots_workspace_id ON public.summary_snapshots USING btree (workspace_id);

CREATE INDEX ix_summary_snapshots_workspace_period_created ON public.summary_snapshots USING btree (workspace_id, period, created_at);

CREATE INDEX ix_sync_actions_created_at ON public.sync_actions USING btree (created_at);

CREATE INDEX ix_sync_actions_sync_groups ON public.sync_actions USING gin (sync_groups);

CREATE INDEX ix_team_accounts_account_id ON public.team_accounts USING btree (account_id);

CREATE INDEX ix_team_accounts_team_id ON public.team_accounts USING btree (team_id);

CREATE INDEX ix_team_documents_team_id ON public.team_documents USING btree (team_id);

CREATE INDEX ix_team_members_member_id ON public.team_members USING btree (member_id);

CREATE INDEX ix_team_members_team_id ON public.team_members USING btree (team_id);

CREATE INDEX ix_teams_deleted_at ON public.teams USING btree (deleted_at);

CREATE INDEX ix_teams_workspace_id ON public.teams USING btree (workspace_id);

CREATE INDEX ix_telegram_connections_chat_id ON public.telegram_connections USING btree (chat_id);

CREATE INDEX ix_telegram_link_tokens_member_id ON public.telegram_link_tokens USING btree (member_id);

CREATE INDEX ix_users_active_workspace_id ON public.users USING btree (active_workspace_id);

CREATE UNIQUE INDEX ix_users_auth_token ON public.users USING btree (auth_token);

CREATE UNIQUE INDEX ix_users_email ON public.users USING btree (email);

CREATE INDEX ix_users_email_verified_at ON public.users USING btree (email_verified_at);

CREATE UNIQUE INDEX ix_users_telegram_id ON public.users USING btree (telegram_id);

CREATE INDEX ix_users_unconfirmed_email ON public.users USING btree (unconfirmed_email);

CREATE UNIQUE INDEX ix_users_username ON public.users USING btree (username);

CREATE INDEX ix_view_settings_member_id ON public.view_settings USING btree (member_id);

CREATE INDEX ix_web_sessions_expires_at ON public.web_sessions USING btree (expires_at);

CREATE INDEX ix_web_sessions_revoked_at ON public.web_sessions USING btree (revoked_at);

CREATE UNIQUE INDEX ix_web_sessions_token_hash ON public.web_sessions USING btree (token_hash);

CREATE INDEX ix_web_sessions_user_id ON public.web_sessions USING btree (user_id);

CREATE INDEX ix_workspace_invites_email ON public.workspace_invites USING btree (email);

CREATE INDEX ix_workspace_invites_expires_at ON public.workspace_invites USING btree (expires_at);

CREATE INDEX ix_workspace_invites_inviter_user_id ON public.workspace_invites USING btree (inviter_user_id);

CREATE INDEX ix_workspace_invites_status ON public.workspace_invites USING btree (status);

CREATE UNIQUE INDEX ix_workspace_invites_token ON public.workspace_invites USING btree (token);

CREATE INDEX ix_workspace_invites_workspace_id ON public.workspace_invites USING btree (workspace_id);

CREATE INDEX ix_workspace_members_user_id ON public.workspace_members USING btree (user_id);

CREATE INDEX ix_workspace_members_workspace_id ON public.workspace_members USING btree (workspace_id);

CREATE INDEX ix_workspace_support_grants_expires_at ON public.workspace_support_grants USING btree (expires_at);

CREATE INDEX ix_workspace_support_grants_revoked_at ON public.workspace_support_grants USING btree (revoked_at);

CREATE INDEX ix_workspace_support_grants_user_id ON public.workspace_support_grants USING btree (user_id);

CREATE INDEX ix_workspace_support_grants_workspace_id ON public.workspace_support_grants USING btree (workspace_id);

CREATE INDEX ix_workspace_view_defaults_workspace_id ON public.workspace_view_defaults USING btree (workspace_id);

CREATE INDEX ix_workspaces_owner_user_id ON public.workspaces USING btree (owner_user_id);

CREATE UNIQUE INDEX ix_workspaces_slug ON public.workspaces USING btree (slug);

CREATE UNIQUE INDEX uq_email_verification_codes_active_scope ON public.email_verification_codes USING btree (scope) WHERE (is_used = false);

CREATE UNIQUE INDEX uq_teams_workspace_key ON public.teams USING btree (workspace_id, upper((key)::text)) WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX uq_teams_workspace_name ON public.teams USING btree (workspace_id, lower((name)::text)) WHERE (deleted_at IS NULL);

CREATE CONSTRAINT TRIGGER sync_actions_assign_id AFTER INSERT ON public.sync_actions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.sync_log_assign_id();

CREATE TRIGGER sync_log_delete BEFORE DELETE ON public.account_notification_settings FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('AccountNotificationSetting', '{}', '', '{}');

CREATE TRIGGER sync_log_delete BEFORE DELETE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('Account', '{access_token,access_token_encrypted,last_started_date,last_day_start_date}', '', '{}');

CREATE TRIGGER sync_log_delete BEFORE DELETE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('InboxEvent', '{}', '', '{}');

CREATE TRIGGER sync_log_delete BEFORE DELETE ON public.favorites FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('Favorite', '{}', '', '{}');

CREATE TRIGGER sync_log_delete BEFORE DELETE ON public.inbox_notification_states FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('InboxNotificationState', '{}', '', '{}');

CREATE TRIGGER sync_log_delete BEFORE DELETE ON public.rule_group_items FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('RuleLabel', '{}', '', '{}');

CREATE TRIGGER sync_log_delete BEFORE DELETE ON public.rule_groups FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('Label', '{}', '', '{}');

CREATE TRIGGER sync_log_delete BEFORE DELETE ON public.rule_presets FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('Rule', '{}', '', '{}');

CREATE TRIGGER sync_log_delete BEFORE DELETE ON public.team_accounts FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('TeamAccount', '{}', '', '{}');

CREATE TRIGGER sync_log_delete BEFORE DELETE ON public.team_documents FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('TeamDocument', '{}', '', '{}');

CREATE TRIGGER sync_log_delete BEFORE DELETE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('TeamMember', '{}', '', '{}');

CREATE TRIGGER sync_log_delete BEFORE DELETE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('Team', '{}', 'deleted_at', '{}');

CREATE TRIGGER sync_log_delete BEFORE DELETE ON public.users FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('User', '{telegram_id,email_verified_at,unconfirmed_email,onboarding_step,onboarding_completed,auth_token,role,is_approved,active_workspace_id}', '', '{}');

CREATE TRIGGER sync_log_delete BEFORE DELETE ON public.view_settings FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('ViewSetting', '{}', '', '{}');

CREATE TRIGGER sync_log_delete BEFORE DELETE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('WorkspaceMember', '{}', '', '{inbox_read_before,inbox_deleted_before,inbox_display,notification_channels}');

CREATE TRIGGER sync_log_delete BEFORE DELETE ON public.workspace_view_defaults FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('WorkspaceViewDefault', '{}', '', '{}');

CREATE TRIGGER sync_log_delete BEFORE DELETE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('Workspace', '{}', '', '{}');

CREATE TRIGGER sync_log_write AFTER INSERT OR UPDATE ON public.account_notification_settings FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('AccountNotificationSetting', '{}', '', '{}');

CREATE TRIGGER sync_log_write AFTER INSERT OR UPDATE ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('Account', '{access_token,access_token_encrypted,last_started_date,last_day_start_date}', '', '{}');

CREATE TRIGGER sync_log_write AFTER INSERT OR UPDATE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('InboxEvent', '{}', '', '{}');

CREATE TRIGGER sync_log_write AFTER INSERT OR UPDATE ON public.favorites FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('Favorite', '{}', '', '{}');

CREATE TRIGGER sync_log_write AFTER INSERT OR UPDATE ON public.inbox_notification_states FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('InboxNotificationState', '{}', '', '{}');

CREATE TRIGGER sync_log_write AFTER INSERT OR UPDATE ON public.rule_group_items FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('RuleLabel', '{}', '', '{}');

CREATE TRIGGER sync_log_write AFTER INSERT OR UPDATE ON public.rule_groups FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('Label', '{}', '', '{}');

CREATE TRIGGER sync_log_write AFTER INSERT OR UPDATE ON public.rule_presets FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('Rule', '{}', '', '{}');

CREATE TRIGGER sync_log_write AFTER INSERT OR UPDATE ON public.team_accounts FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('TeamAccount', '{}', '', '{}');

CREATE TRIGGER sync_log_write AFTER INSERT OR UPDATE ON public.team_documents FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('TeamDocument', '{}', '', '{}');

CREATE TRIGGER sync_log_write AFTER INSERT OR UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('TeamMember', '{}', '', '{}');

CREATE TRIGGER sync_log_write AFTER INSERT OR UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('Team', '{}', 'deleted_at', '{}');

CREATE TRIGGER sync_log_write AFTER INSERT OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('User', '{telegram_id,email_verified_at,unconfirmed_email,onboarding_step,onboarding_completed,auth_token,role,is_approved,active_workspace_id}', '', '{}');

CREATE TRIGGER sync_log_write AFTER INSERT OR UPDATE ON public.view_settings FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('ViewSetting', '{}', '', '{}');

CREATE TRIGGER sync_log_write AFTER INSERT OR UPDATE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('WorkspaceMember', '{}', '', '{inbox_read_before,inbox_deleted_before,inbox_display,notification_channels}');

CREATE TRIGGER sync_log_write AFTER INSERT OR UPDATE ON public.workspace_view_defaults FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('WorkspaceViewDefault', '{}', '', '{}');

CREATE TRIGGER sync_log_write AFTER INSERT OR UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.sync_log_record('Workspace', '{}', '', '{}');

CREATE TRIGGER trg_rule_group_item_workspace BEFORE INSERT OR UPDATE ON public.rule_group_items FOR EACH ROW EXECUTE FUNCTION public.enforce_rule_group_item_workspace();

ALTER TABLE ONLY public.account_health
    ADD CONSTRAINT account_health_account_pk_fkey FOREIGN KEY (account_pk) REFERENCES public.accounts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.account_health
    ADD CONSTRAINT account_health_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.account_notification_settings
    ADD CONSTRAINT account_notification_settings_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.workspace_members(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_lead_user_id_fkey FOREIGN KEY (lead_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_meta_connection_id_fkey FOREIGN KEY (meta_connection_id) REFERENCES public.meta_connections(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.action_undo_states
    ADD CONSTRAINT action_undo_states_original_event_id_fkey FOREIGN KEY (original_event_id) REFERENCES public.audit_events(id);

ALTER TABLE ONLY public.action_undo_states
    ADD CONSTRAINT action_undo_states_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.analytics_entity_daily_facts
    ADD CONSTRAINT analytics_entity_daily_facts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_reverts_event_id_fkey FOREIGN KEY (reverts_event_id) REFERENCES public.audit_events(id);

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.automation_schedule_states
    ADD CONSTRAINT automation_schedule_states_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.deleted_items
    ADD CONSTRAINT deleted_items_deleted_by_user_id_fkey FOREIGN KEY (deleted_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.deleted_items
    ADD CONSTRAINT deleted_items_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.desktop_push_subscriptions
    ADD CONSTRAINT desktop_push_subscriptions_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.workspace_members(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.desktop_push_subscriptions
    ADD CONSTRAINT desktop_push_subscriptions_web_session_id_fkey FOREIGN KEY (web_session_id) REFERENCES public.web_sessions(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.favorites
    ADD CONSTRAINT favorites_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.workspace_members(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.email_verification_codes
    ADD CONSTRAINT fk_email_verification_codes_invite FOREIGN KEY (invite_id) REFERENCES public.workspace_invites(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.meta_oauth_states
    ADD CONSTRAINT fk_meta_oauth_states_invite_id FOREIGN KEY (invite_id) REFERENCES public.meta_connection_invites(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.rule_examples_bootstrap
    ADD CONSTRAINT fk_rule_examples_bootstrap_workspace FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_active_workspace FOREIGN KEY (active_workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.inbox_email_deliveries
    ADD CONSTRAINT inbox_email_deliveries_audit_event_id_fkey FOREIGN KEY (audit_event_id) REFERENCES public.audit_events(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.inbox_email_deliveries
    ADD CONSTRAINT inbox_email_deliveries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.inbox_notification_states
    ADD CONSTRAINT inbox_notification_states_audit_event_id_fkey FOREIGN KEY (audit_event_id) REFERENCES public.audit_events(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.inbox_notification_states
    ADD CONSTRAINT inbox_notification_states_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.inbox_push_deliveries
    ADD CONSTRAINT inbox_push_deliveries_audit_event_id_fkey FOREIGN KEY (audit_event_id) REFERENCES public.audit_events(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.inbox_push_deliveries
    ADD CONSTRAINT inbox_push_deliveries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.inbox_telegram_deliveries
    ADD CONSTRAINT inbox_telegram_deliveries_audit_event_id_fkey FOREIGN KEY (audit_event_id) REFERENCES public.audit_events(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.inbox_telegram_deliveries
    ADD CONSTRAINT inbox_telegram_deliveries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.meta_connection_assets
    ADD CONSTRAINT meta_connection_assets_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES public.meta_connections(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.meta_connection_assets
    ADD CONSTRAINT meta_connection_assets_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.meta_connection_invites
    ADD CONSTRAINT meta_connection_invites_connected_meta_id_fkey FOREIGN KEY (connected_meta_id) REFERENCES public.meta_connections(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.meta_connection_invites
    ADD CONSTRAINT meta_connection_invites_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.meta_connection_invites
    ADD CONSTRAINT meta_connection_invites_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.meta_connections
    ADD CONSTRAINT meta_connections_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.meta_connections
    ADD CONSTRAINT meta_connections_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.meta_oauth_states
    ADD CONSTRAINT meta_oauth_states_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.meta_oauth_states
    ADD CONSTRAINT meta_oauth_states_reconnect_connection_id_fkey FOREIGN KEY (reconnect_connection_id) REFERENCES public.meta_connections(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.meta_oauth_states
    ADD CONSTRAINT meta_oauth_states_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.rule_entity_states
    ADD CONSTRAINT rule_entity_states_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.rule_examples_bootstrap
    ADD CONSTRAINT rule_examples_bootstrap_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.rule_execution_states
    ADD CONSTRAINT rule_execution_states_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.rule_group_items
    ADD CONSTRAINT rule_group_items_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.rule_groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.rule_group_items
    ADD CONSTRAINT rule_group_items_preset_id_fkey FOREIGN KEY (preset_id) REFERENCES public.rule_presets(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.rule_groups
    ADD CONSTRAINT rule_groups_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.rule_groups
    ADD CONSTRAINT rule_groups_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.rule_presets
    ADD CONSTRAINT rule_presets_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.rule_presets
    ADD CONSTRAINT rule_presets_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.summary_snapshots
    ADD CONSTRAINT summary_snapshots_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.summary_snapshots
    ADD CONSTRAINT summary_snapshots_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.team_accounts
    ADD CONSTRAINT team_accounts_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.team_accounts
    ADD CONSTRAINT team_accounts_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.team_documents
    ADD CONSTRAINT team_documents_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.team_documents
    ADD CONSTRAINT team_documents_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.team_documents
    ADD CONSTRAINT team_documents_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.workspace_members(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.telegram_connections
    ADD CONSTRAINT telegram_connections_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.workspace_members(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.telegram_link_tokens
    ADD CONSTRAINT telegram_link_tokens_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.workspace_members(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.view_settings
    ADD CONSTRAINT view_settings_member_id_fkey FOREIGN KEY (member_id) REFERENCES public.workspace_members(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.web_sessions
    ADD CONSTRAINT web_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workspace_invites
    ADD CONSTRAINT workspace_invites_inviter_user_id_fkey FOREIGN KEY (inviter_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.workspace_invites
    ADD CONSTRAINT workspace_invites_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workspace_support_grants
    ADD CONSTRAINT workspace_support_grants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workspace_support_grants
    ADD CONSTRAINT workspace_support_grants_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workspace_view_defaults
    ADD CONSTRAINT workspace_view_defaults_updated_by_user_id_fkey FOREIGN KEY (updated_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.workspace_view_defaults
    ADD CONSTRAINT workspace_view_defaults_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE CASCADE;
`;
