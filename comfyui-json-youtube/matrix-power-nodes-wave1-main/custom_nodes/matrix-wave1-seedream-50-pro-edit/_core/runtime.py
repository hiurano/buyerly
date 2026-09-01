"""Compiler-owned deployment runtime; regenerate instead of hand-editing."""
from __future__ import annotations

import hashlib
import json
from functools import partial
from pathlib import Path
import threading
import time
import uuid


RUNTIME_CONTRACTS = {'wavespeed': {'auth': 'bearer',
               'auth_prefix': '',
               'base_url': 'https://api.wavespeed.ai',
               'env_names': ('WAVESPEED_API_KEY', 'MATRIX_WAVESPEED_KEY'),
               'max_download_bytes': 209715200,
               'provider_fact': {'fetched': '2026-08-04T12:00:38+02:00',
                                 'generator': 'src/tools/fetch_routes.py',
                                 'lifecycle': {'_note': 'Lifecycle paths appear in no model schema '
                                                        '- they are provider knowledge and live '
                                                        'here exactly once. upload_max_bytes is '
                                                        'the PLATFORM cap; a route may cap lower, '
                                                        'which is why routes carry their own '
                                                        'limits.',
                                               '_note_download_max_bytes': 'A LOCAL RESOURCE '
                                                                           'BOUND, not a provider '
                                                                           'fact. Stated '
                                                                           'explicitly on '
                                                                           '2026-07-29 because the '
                                                                           'compiler had been '
                                                                           'SILENTLY reusing '
                                                                           'upload_max_bytes as '
                                                                           'the output download '
                                                                           'cap - a different '
                                                                           'contract that nobody '
                                                                           'had ever chosen for '
                                                                           'this purpose. The '
                                                                           'value is identical to '
                                                                           'the old implicit one '
                                                                           'so behaviour is '
                                                                           'unchanged; what '
                                                                           'changed is that it is '
                                                                           'now a visible '
                                                                           'decision. See the fal '
                                                                           'entry for the same '
                                                                           'field and the same '
                                                                           'reasoning.',
                                               'application_envelope': {'code_path': 'code',
                                                                        'message_path': 'message',
                                                                        'rejection_billing': 'not_billed',
                                                                        'success_codes': [200]},
                                               'balance': 'GET {base_url}/api/v3/balance',
                                               'download_max_bytes': 209715200,
                                               'error_path': 'data.error',
                                               'outputs_path': 'data.outputs',
                                               'poll': 'GET '
                                                       '{base_url}/api/v3/predictions/{task_id}/result',
                                               'status_done': ['completed', 'succeeded', 'success'],
                                               'status_failed': ['failed', 'error'],
                                               'status_path': 'data.status',
                                               'submit': 'POST {base_url}/api/v3/{route}',
                                               'task_id_path': 'data.id',
                                               'upload': 'POST '
                                                         '{base_url}/api/v3/media/upload/binary',
                                               'upload_max_bytes': 209715200,
                                               'upload_retention_days': 7},
                                 'provider': 'wavespeed',
                                 'routes': {'bytedance/seedream-v5.0-pro/edit': {'api_path': '/api/v3/bytedance/seedream-v5.0-pro/edit',
                                                                                 'fields': {'aspect_ratio': {'description': 'The '
                                                                                                                            'aspect '
                                                                                                                            'ratio '
                                                                                                                            'of '
                                                                                                                            'the '
                                                                                                                            'generated '
                                                                                                                            'image. '
                                                                                                                            'Leave '
                                                                                                                            'empty '
                                                                                                                            'to '
                                                                                                                            'automatically '
                                                                                                                            'use '
                                                                                                                            'the '
                                                                                                                            'closest '
                                                                                                                            'supported '
                                                                                                                            'aspect '
                                                                                                                            'ratio '
                                                                                                                            'based '
                                                                                                                            'on '
                                                                                                                            'the '
                                                                                                                            'first '
                                                                                                                            'input '
                                                                                                                            'image.',
                                                                                                             'enum': ['1:1',
                                                                                                                      '1:2',
                                                                                                                      '2:1',
                                                                                                                      '1:3',
                                                                                                                      '3:1',
                                                                                                                      '2:3',
                                                                                                                      '3:2',
                                                                                                                      '3:4',
                                                                                                                      '4:3',
                                                                                                                      '4:5',
                                                                                                                      '5:4',
                                                                                                                      '9:16',
                                                                                                                      '16:9',
                                                                                                                      '9:21',
                                                                                                                      '21:9'],
                                                                                                             'type': 'string'},
                                                                                            'enable_base64_output': {'description': 'If '
                                                                                                                                    'set '
                                                                                                                                    'to '
                                                                                                                                    '`true`, '
                                                                                                                                    'the '
                                                                                                                                    "prediction's "
                                                                                                                                    '`output` '
                                                                                                                                    'strings '
                                                                                                                                    'are '
                                                                                                                                    'returned '
                                                                                                                                    'as '
                                                                                                                                    '**naked '
                                                                                                                                    'base64** '
                                                                                                                                    '(no '
                                                                                                                                    '`data:<mime>;base64,` '
                                                                                                                                    'prefix). '
                                                                                                                                    'When '
                                                                                                                                    '`false` '
                                                                                                                                    '(default), '
                                                                                                                                    'outputs '
                                                                                                                                    'are '
                                                                                                                                    'returned '
                                                                                                                                    'as '
                                                                                                                                    'URLs '
                                                                                                                                    'pointing '
                                                                                                                                    'to '
                                                                                                                                    'our '
                                                                                                                                    'CDN.',
                                                                                                                     'disabled': True,
                                                                                                                     'type': 'boolean'},
                                                                                            'enable_sync_mode': {'description': 'If '
                                                                                                                                'set '
                                                                                                                                'to '
                                                                                                                                '`true`, '
                                                                                                                                'the '
                                                                                                                                'request '
                                                                                                                                'attempts '
                                                                                                                                'to '
                                                                                                                                'wait '
                                                                                                                                'for '
                                                                                                                                'the '
                                                                                                                                'generated '
                                                                                                                                'result '
                                                                                                                                'and '
                                                                                                                                'return '
                                                                                                                                'outputs '
                                                                                                                                'in '
                                                                                                                                'the '
                                                                                                                                'same '
                                                                                                                                'response. '
                                                                                                                                'If '
                                                                                                                                'the '
                                                                                                                                'result '
                                                                                                                                'is '
                                                                                                                                'not '
                                                                                                                                'ready '
                                                                                                                                'within '
                                                                                                                                'the '
                                                                                                                                'sync '
                                                                                                                                'wait '
                                                                                                                                'window, '
                                                                                                                                'the '
                                                                                                                                'API '
                                                                                                                                'can '
                                                                                                                                'return '
                                                                                                                                'a '
                                                                                                                                'timeout '
                                                                                                                                'bo',
                                                                                                                 'disabled': True,
                                                                                                                 'type': 'boolean'},
                                                                                            'images': {'description': 'The '
                                                                                                                      'images '
                                                                                                                      'to '
                                                                                                                      'edit. '
                                                                                                                      'A '
                                                                                                                      'maximum '
                                                                                                                      'of '
                                                                                                                      '10 '
                                                                                                                      'reference '
                                                                                                                      'images '
                                                                                                                      'can '
                                                                                                                      'be '
                                                                                                                      'uploaded.',
                                                                                                       'maxItems': 10,
                                                                                                       'minItems': 1,
                                                                                                       'type': 'array'},
                                                                                            'output_format': {'default': 'jpeg',
                                                                                                              'description': 'The '
                                                                                                                             'format '
                                                                                                                             'of '
                                                                                                                             'the '
                                                                                                                             'output '
                                                                                                                             'image.',
                                                                                                              'enum': ['jpeg',
                                                                                                                       'png'],
                                                                                                              'type': 'string'},
                                                                                            'prompt': {'description': 'The '
                                                                                                                      'positive '
                                                                                                                      'prompt '
                                                                                                                      'for '
                                                                                                                      'the '
                                                                                                                      'generation.',
                                                                                                       'type': 'string'},
                                                                                            'resolution': {'default': '1k',
                                                                                                           'description': 'The '
                                                                                                                          'output '
                                                                                                                          'resolution '
                                                                                                                          'tier '
                                                                                                                          'used '
                                                                                                                          'for '
                                                                                                                          'billing. '
                                                                                                                          '1k '
                                                                                                                          'is '
                                                                                                                          'the '
                                                                                                                          'lower-cost '
                                                                                                                          'tier; '
                                                                                                                          '2k '
                                                                                                                          'is '
                                                                                                                          'the '
                                                                                                                          'higher-cost '
                                                                                                                          'tier.',
                                                                                                           'enum': ['1k',
                                                                                                                    '2k'],
                                                                                                           'type': 'string'}},
                                                                                 'formula': '{"total_price": '
                                                                                            '(resolution '
                                                                                            '= '
                                                                                            '"2k" '
                                                                                            '? '
                                                                                            '90000 '
                                                                                            ': '
                                                                                            '45000) '
                                                                                            '+ '
                                                                                            '3000 '
                                                                                            '* '
                                                                                            '$max([0, '
                                                                                            '$count(images) '
                                                                                            '- '
                                                                                            '1])}',
                                                                                 'price': 0.045,
                                                                                 'price_provenance': {'fetched': '2026-08-04T12:00:38+02:00',
                                                                                                      'field': 'base_price',
                                                                                                      'source': 'catalogue'},
                                                                                 'required': ['prompt',
                                                                                              'images'],
                                                                                 'type': 'image-to-image'}}},
               'route_max_costs': {'bytedance/seedream-v5.0-pro/edit': 0.117}}}
_PACK_ID = '7cb0eaf77d5597be'
SEMANTIC_RUNTIME_IDS = {'MATRIX_Wave1Seedream50ProEdit': '7b0cdefe8b51ed066c6fbaa14e1d8a7802cfbbf9b868d2eeed980deaef6c7af6'}
PROCESS_BOOT_UUID = uuid.uuid4().hex
_WRITE_LOCK = threading.Lock()
_CACHES = {}


class _SilentProgress:
    def update_absolute(self, value, total):
        return None


def _state_root():
    try:
        import folder_paths
        root = Path(folder_paths.get_user_directory())
    except (ImportError, AttributeError):
        root = Path(__file__).resolve().parent / "_state"
    return root / "matrix-compiled" / _PACK_ID


def _credential_root():
    try:
        import folder_paths
        return Path(folder_paths.get_user_directory()) / "credentials"
    except (ImportError, AttributeError):
        return _state_root() / "credentials"


def _paid_operations_root():
    try:
        import folder_paths
        root = Path(folder_paths.get_user_directory())
    except (ImportError, AttributeError):
        root = Path(__file__).resolve().parent / "_state"
    return root / "matrix-compiled" / "shared" / "paid-operations" / "v1"


def _comfy_context(live):
    if not live:
        return _SilentProgress(), (lambda event, payload: None), ""
    try:
        from comfy.utils import ProgressBar
        from server import PromptServer
    except ImportError as exc:
        raise RuntimeError("live execution requires the ComfyUI runtime") from exc
    server = PromptServer.instance
    prompt_id = str(getattr(server, "last_prompt_id", "") or "")
    if not prompt_id:
        raise RuntimeError("live execution has no ComfyUI prompt id")

    def send_status(event, payload):
        return server.send_sync(event, payload, getattr(server, "client_id", None))

    return ProgressBar(1), send_status, prompt_id


def _cache(provider):
    if provider not in _CACHES:
        from .cache_semantic import SemanticCache
        _CACHES[provider] = SemanticCache(_state_root() / provider / "cache")
    return _CACHES[provider]


def _path(value, dotted):
    for part in dotted.split("."):
        if not isinstance(value, dict):
            return None
        value = value.get(part)
    return value


def _auth_headers(contract, credential):
    if contract["auth"] == "bearer":
        return {"Authorization": "Bearer " + credential}
    header_name = contract["auth"].split(":", 1)[1]
    return {header_name: contract["auth_prefix"] + credential}


async def _upload_large_file(
    data,
    filename,
    content_type,
    *,
    credential,
    auth_headers,
    lifecycle,
    base_url,
    deadline,
    request_timeout,
):
    from .errors_taxonomy import EmptyOrMalformedSuccessError
    from .media_image_in import RemoteAsset
    from .transport_http import HttpResponse, request

    template = lifecycle.get("upload")
    if not isinstance(template, str) or not template:
        raise EmptyOrMalformedSuccessError("provider fact has no upload endpoint")
    try:
        method, endpoint = template.split(None, 1)
    except ValueError as exc:
        raise EmptyOrMalformedSuccessError(
            "provider upload endpoint must declare method and URL"
        ) from exc
    method = method.upper()
    if method != "POST":
        raise EmptyOrMalformedSuccessError(
            "binary upload endpoint must use POST"
        )
    boundary = "----MatrixCompiled" + hashlib.sha256(data).hexdigest()[:24]
    safe_name = Path(str(filename)).name.replace('"', "")
    prefix = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{safe_name}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode("ascii")
    body = prefix + data + f"\r\n--{boundary}--\r\n".encode("ascii")
    headers = dict(auth_headers(credential))
    headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    response = await request(
        method,
        endpoint.format(base_url=base_url),
        deadline=deadline,
        request_timeout=request_timeout,
        headers=headers,
        data=body,
    )
    if not isinstance(response, HttpResponse):
        raise EmptyOrMalformedSuccessError("upload transport returned no HTTP response")
    try:
        decoded = json.loads(response.body)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise EmptyOrMalformedSuccessError("upload response was not valid JSON") from exc
    url = (
        _path(decoded, "data.download_url")
        or _path(decoded, "data.url")
        or _path(decoded, "url")
    )
    if not isinstance(url, str) or not url.startswith(("https://", "http://")):
        raise EmptyOrMalformedSuccessError("upload response contained no usable URL")
    retention = int(lifecycle.get("upload_retention_days", 0))
    if retention < 1:
        raise EmptyOrMalformedSuccessError("provider fact has no upload retention")
    return RemoteAsset(remote_id=url, url=url, expires_at=time.time() + retention * 86400)


def build_runtime(
    node_id,
    provider,
    route_ids,
    inputs,
    *,
    run_operations=1,
    instance_id=None,
    raw_live=None,
):
    """Build every flow.api-media dependency without adding a node widget."""
    try:
        contract = RUNTIME_CONTRACTS[provider]
    except KeyError as exc:
        raise RuntimeError(f"compiled pack has no runtime for provider {provider!r}") from exc
    from .flow_api_media import MISSING, parse_live_mode
    if raw_live is None:
        raw_live = MISSING
    live = parse_live_mode(inputs.get("live", MISSING), raw_value=raw_live)
    selected_route = str(inputs.get("model") or tuple(route_ids)[0])
    try:
        operation_ceiling = float(contract["route_max_costs"][selected_route])
    except (KeyError, TypeError, ValueError) as exc:
        raise RuntimeError(
            f"compiled pack has no automatic cost bound for route {selected_route!r}"
        ) from exc
    if int(run_operations) < 1:
        raise RuntimeError("run_operations must be at least one")
    actual_node_id = str(instance_id or node_id)
    progress_bar, send_status, prompt_id = _comfy_context(live)
    make_headers = lambda credential: _auth_headers(contract, credential)
    from .cache_semantic import OperationJournal
    return {
        "auth_headers": make_headers,
        "base_url": contract["base_url"],
        "credential_root": _credential_root(),
        "env_names": contract["env_names"],
        "max_download_bytes": contract["max_download_bytes"],
        "operation_journal": OperationJournal(_paid_operations_root()),
        "artifact_semantics_version": SEMANTIC_RUNTIME_IDS.get(
            str(node_id), next(iter(SEMANTIC_RUNTIME_IDS.values()))
        ),
        "process_boot_uuid": PROCESS_BOOT_UUID,
        "actor": {
            "process_boot_uuid": PROCESS_BOOT_UUID,
            "prompt_id": prompt_id,
            "node_instance_id": actual_node_id,
            "node_type": str(node_id),
        },
        "node_id": actual_node_id,
        "node_type": str(node_id),
        "raw_live": raw_live,
        "progress_bar": progress_bar,
        "prompt_id": prompt_id,
        "provider_fact": contract["provider_fact"],
        "per_operation_ceiling": operation_ceiling,
        "route_ids": tuple(route_ids),
        "run_id": prompt_id or node_id,
        "run_ceiling": operation_ceiling * int(run_operations),
        "max_in_flight": 1,
        "upload_request_timeout": 300,
        "semantic_cache": _cache(provider),
        "send_status": send_status,
        "upload_large_file": partial(_upload_large_file, auth_headers=make_headers),
    }


__all__ = ["RUNTIME_CONTRACTS", "SEMANTIC_RUNTIME_IDS", "build_runtime"]
