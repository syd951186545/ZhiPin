ARG OPENCLAW_BASE_IMAGE=ghcr.io/openclaw/openclaw:latest
FROM ${OPENCLAW_BASE_IMAGE}

ARG PLAYWRIGHT_SKILL_REF=v4.1.0
ARG APT_MIRROR_HOST=mirrors.tuna.tsinghua.edu.cn
ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG PLAYWRIGHT_DOWNLOAD_HOST=https://npmmirror.com/mirrors/playwright

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PLAYWRIGHT_BROWSERS_PATH=/opt/openclaw-home-seed/.cache/ms-playwright \
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
        gosu \
        python3 \
        python3-pip \
        xvfb \
        x11vnc \
        websockify \
        novnc \
        fonts-noto-cjk \
        locales \
    && sed -i 's/^# *\(zh_CN.UTF-8\)/\1/' /etc/locale.gen \
    && locale-gen zh_CN.UTF-8 \
    && ln -sf /usr/bin/python3 /usr/local/bin/python \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/openclaw-home-seed/.openclaw/skills /opt/openclaw-home-seed/.cache /app/backend

COPY backend/requirements.txt /tmp/backend-requirements.txt
RUN python3 -m pip install --break-system-packages -r /tmp/backend-requirements.txt

RUN git clone --depth 1 --branch "${PLAYWRIGHT_SKILL_REF}" https://github.com/lackeyjb/playwright-skill.git /tmp/playwright-skill \
    && cp -R /tmp/playwright-skill/skills/playwright-skill /opt/openclaw-home-seed/.openclaw/skills/playwright-skill \
    && rm -rf /tmp/playwright-skill

COPY deploy/openclaw-skills/browser-guardrails-skill /opt/openclaw-home-seed/.openclaw/skills/browser-guardrails-skill
COPY deploy/generated/openclaw.generated.json /opt/openclaw-home-seed/.openclaw/openclaw.json
COPY backend/.env.production /app/backend/.env.production
COPY backend /app/backend
COPY deploy/docker/backopenclaw-entrypoint.sh /usr/local/bin/backopenclaw-entrypoint.sh

RUN chown -R node:node /opt/openclaw-home-seed /app/backend \
    && chmod +x /usr/local/bin/backopenclaw-entrypoint.sh

USER node

RUN cd /opt/openclaw-home-seed/.openclaw/skills/playwright-skill \
    && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm_config_registry="${NPM_REGISTRY}" npm install --omit=dev

USER root

ENV PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache/ms-playwright \
    PLAYWRIGHT_DOWNLOAD_HOST=${PLAYWRIGHT_DOWNLOAD_HOST} \
    CHROME_BIN=/usr/bin/chromium \
    CHROMIUM_BIN=/usr/bin/chromium \
    LANG=zh_CN.UTF-8 \
    LANGUAGE=zh_CN:zh \
    LC_ALL=zh_CN.UTF-8

EXPOSE 8000
# noVNC websockify ports for live login (configurable via LIVE_LOGIN_MAX_CONCURRENT)
EXPOSE 6800-6804

ENTRYPOINT ["/usr/local/bin/backopenclaw-entrypoint.sh"]
