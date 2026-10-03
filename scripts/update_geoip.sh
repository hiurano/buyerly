#!/usr/bin/env bash
# Downloads the city database that turns a session's IP address into
# "Helsinki, 18, FI" in Settings → Security & access. With MAXMIND_ACCOUNT_ID and
# MAXMIND_LICENSE_KEY in .env it takes MaxMind GeoLite2 City (region codes, as in
# Linear); without them DB-IP Lite City (no account, region names, CC BY 4.0).
# A fresh file (under 25 days old) is kept. Any failure leaves the old file and
# exits 0: locations are a nicety and never block a deploy.
set -uo pipefail

GEOIP_DIR="${GEOIP_DIR:-geoip}"
TARGET="${GEOIP_DIR}/city.mmdb"
MAX_AGE_DAYS="${GEOIP_MAX_AGE_DAYS:-25}"

env_value() {
    [[ -f .env ]] || return 0
    sed -n "s/^$1=//p" .env | tail -n 1 | tr -d " \t\r\n\"'"
}

MAXMIND_ACCOUNT_ID="${MAXMIND_ACCOUNT_ID:-$(env_value MAXMIND_ACCOUNT_ID)}"
MAXMIND_LICENSE_KEY="${MAXMIND_LICENSE_KEY:-$(env_value MAXMIND_LICENSE_KEY)}"

mkdir -p "${GEOIP_DIR}"
if [[ -s "${TARGET}" && -z "$(find "${TARGET}" -mtime "+${MAX_AGE_DAYS}" 2>/dev/null)" ]]; then
    echo "GeoIP: ${TARGET} is fresh"
    exit 0
fi

work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT

download_maxmind() {
    curl -fsSL --max-time 300 -u "${MAXMIND_ACCOUNT_ID}:${MAXMIND_LICENSE_KEY}" \
        -o "${work}/city.tar.gz" \
        "https://download.maxmind.com/geoip/databases/GeoLite2-City/download?suffix=tar.gz" \
        && tar -xzf "${work}/city.tar.gz" -C "${work}" \
        && find "${work}" -name 'GeoLite2-City.mmdb' -exec mv {} "${work}/city.mmdb" \;
}

download_dbip() {
    # This month's file appears in the first days of the month; last month's stays valid.
    local month
    for month in "$(date -u +%Y-%m)" "$(date -u -d "$(date -u +%Y-%m-15) -1 month" +%Y-%m)"; do
        if curl -fsSL --max-time 300 -o "${work}/city.mmdb.gz" \
            "https://download.db-ip.com/free/dbip-city-lite-${month}.mmdb.gz"; then
            gunzip -f "${work}/city.mmdb.gz" && return 0
        fi
    done
    return 1
}

if [[ -n "${MAXMIND_ACCOUNT_ID}" && -n "${MAXMIND_LICENSE_KEY}" ]]; then
    source_name="MaxMind GeoLite2 City"
    download_maxmind
else
    source_name="DB-IP Lite City"
    download_dbip
fi
status=$?

# A real city database is tens of megabytes; anything small is an error page.
if (( status != 0 )) || [[ ! -s "${work}/city.mmdb" ]] \
    || (( $(stat -c %s "${work}/city.mmdb") < 10000000 )); then
    echo "[WARN] GeoIP: could not download ${source_name}; keeping the current file" >&2
    exit 0
fi

mv -f "${work}/city.mmdb" "${TARGET}"
chmod 644 "${TARGET}"
echo "GeoIP: ${TARGET} updated from ${source_name}"
