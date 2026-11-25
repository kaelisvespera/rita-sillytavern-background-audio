(() => {
    const panelId = 'rita-tt-android-keepalive';
    const audioUrl = new URL('./keepalive.wav', import.meta.url);
    const settings = document.getElementById('extensions_settings2')
        || document.getElementById('extensions_settings');
    if (!settings || document.getElementById(panelId)) return;

    const panel = document.createElement('div');
    panel.id = panelId;
    panel.className = 'extension_container';
    panel.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Rita 后台保活 · TT 安卓</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
            </div>
            <div class="inline-drawer-content">
                <p class="st-keepalive-help">切换应用前先开启。音频中断时，回到酒馆会尝试恢复。</p>
                <button id="rita-tt-android-keepalive-toggle" class="menu_button" type="button" aria-pressed="false">开启保活</button>
                <span id="rita-tt-android-keepalive-status" class="st-keepalive-status" role="status">未开启</span>
            </div>
        </div>`;
    settings.appendChild(panel);

    const floating = document.createElement('div');
    floating.id = 'rita-tt-android-keepalive-float';
    floating.innerHTML = '<button type="button" aria-label="后台保活" aria-pressed="false">保活</button>';
    document.body.appendChild(floating);

    const button = panel.querySelector('#rita-tt-android-keepalive-toggle');
    const status = panel.querySelector('#rita-tt-android-keepalive-status');
    const floatingButton = floating.querySelector('button');
    let audio = null;
    let pending = null;

    function setState(message, playing = false) {
        const enabled = audio !== null;
        button.textContent = enabled ? '关闭保活' : '开启保活';
        floatingButton.textContent = enabled ? (playing ? '保活 · 播放中' : '保活 · 等待') : '保活';
        button.setAttribute('aria-pressed', String(enabled));
        floatingButton.setAttribute('aria-pressed', String(enabled));
        status.textContent = message;
        status.classList.toggle('st-keepalive-on', playing);
    }

    function stop(message = '未开启') {
        const previous = audio;
        audio = null;
        pending = null;
        if (previous) {
            previous.pause();
            previous.removeAttribute('src');
            previous.load();
            previous.remove();
        }
        setState(message);
    }

    async function play() {
        const current = audio;
        if (!current || pending === current || !current.paused) return;

        pending = current;
        setState('正在启动音频…');
        try {
            await current.play();
            if (audio === current && !current.paused) setState('音频播放中', true);
        } catch (error) {
            if (audio === current) {
                stop(error.name === 'NotAllowedError' ? '请再次点击开启保活。' : '音频播放失败，请重试。');
            }
        } finally {
            if (pending === current) pending = null;
        }
    }

    function toggle() {
        if (audio) {
            stop();
            return;
        }

        const current = document.createElement('audio');
        current.loop = true;
        current.preload = 'auto';
        current.src = audioUrl.href;
        current.hidden = true;
        current.addEventListener('pause', () => {
            if (audio === current && current.paused) setState('音频已暂停，回到酒馆时会尝试恢复。');
        });
        current.addEventListener('playing', () => {
            if (audio === current && !current.paused) setState('音频播放中', true);
        });
        current.addEventListener('error', () => {
            if (audio === current) stop('音频加载失败，请重试。');
        });
        document.body.appendChild(current);
        audio = current;
        void play();
    }

    function resumeOnReturn() {
        if (document.visibilityState === 'visible') void play();
    }

    button.addEventListener('click', toggle);
    floatingButton.addEventListener('click', toggle);
    document.addEventListener('visibilitychange', resumeOnReturn);
    window.addEventListener('pageshow', resumeOnReturn);
    window.addEventListener('focus', resumeOnReturn);
    window.addEventListener('pagehide', (event) => {
        if (!event.persisted && audio) stop();
    });
})();
