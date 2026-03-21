ARG OPENCLAW_BASE_IMAGE=ghcr.io/openclaw/openclaw:latest
FROM ${OPENCLAW_BASE_IMAGE}

ARG PLAYWRIGHT_SKILL_REF=v4.1.0
ARG APT_MIRROR_HOST=mirrors.tuna.tsinghua.edu.cn
ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright

ENV PLAYWRIGHT_BROWSERS_PATH=/opt/openclaw-home-seed/.cache/ms-playwright \
    PLAYWRIGHT_DOWNLOAD_HOST=${PLAYWRIGHT_DOWNLOAD_HOST}

USER root

RUN set -eux; \
    if [ -n "${APT_MIRROR_HOST}" ]; then \
        for file in /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do \
            [ -f "$file" ] || continue; \
            sed -i \
                -e "s|http://deb.debian.org|https://${APT_MIRROR_HOST}|g" \
                -e "s|http://security.debian.org|https://${APT_MIRROR_HOST}|g" \
                -e "s|http://archive.ubuntu.com|https://${APT_MIRROR_HOST}|g" \
                -e "s|http://security.ubuntu.com|https://${APT_MIRROR_HOST}|g" \
                -e "s|https://deb.debian.org|https://${APT_MIRROR_HOST}|g" \
                -e "s|https://security.debian.org|https://${APT_MIRROR_HOST}|g" \
                -e "s|https://archive.ubuntu.com|https://${APT_MIRROR_HOST}|g" \
                -e "s|https://security.ubuntu.com|https://${APT_MIRROR_HOST}|g" \
                "$file"; \
        done; \
    fi; \
    apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        chromium \
        curl \
        git \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/openclaw-home-seed/.openclaw/skills /opt/openclaw-home-seed/.cache

RUN git clone --depth 1 --branch "${PLAYWRIGHT_SKILL_REF}" https://github.com/lackeyjb/playwright-skill.git /tmp/playwright-skill \
    && cp -R /tmp/playwright-skill/skills/playwright-skill /opt/openclaw-home-seed/.openclaw/skills/playwright-skill \
    && rm -rf /tmp/playwright-skill

COPY --chown=node:node deploy/openclaw-skills/browser-guardrails-skill /opt/openclaw-home-seed/.openclaw/skills/browser-guardrails-skill

RUN chown -R node:node /opt/openclaw-home-seed

USER node

RUN cd /opt/openclaw-home-seed/.openclaw/skills/playwright-skill \
    && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm_config_registry="${NPM_REGISTRY}" npm install --omit=dev

COPY --chown=node:node deploy/docker/openclaw-entrypoint.sh /usr/local/bin/openclaw-entrypoint.sh

ENV PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache/ms-playwright \
    PLAYWRIGHT_DOWNLOAD_HOST=${PLAYWRIGHT_DOWNLOAD_HOST} \
    CHROME_BIN=/usr/bin/chromium \
    CHROMIUM_BIN=/usr/bin/chromium

ENTRYPOINT ["/usr/local/bin/openclaw-entrypoint.sh"]
CMD ["node", "openclaw.mjs", "gateway", "--allow-unconfigured"]
