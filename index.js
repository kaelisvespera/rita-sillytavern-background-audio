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
                <p class="st-keepalive-help">
                    <label for="rita-tt-android-keepalive-mode">播放方式</label>
                    <select id="rita-tt-android-keepalive-mode">
                        <option value="wav">WAV 循环（默认）</option>
                        <option value="web-audio">Web Audio（实验）</option>
                    </select>
                </p>
                <button id="rita-tt-android-keepalive-toggle" class="menu_button" type="button" aria-pressed="false">开启保活</button>
                <span id="rita-tt-android-keepalive-status" class="st-keepalive-status" role="status">未开启</span>
            </div>
        </div>`;
    settings.appendChild(panel);

    const floatingButton = document.createElement('button');
    floatingButton.id = 'rita-tt-android-keepalive-float';
    floatingButton.type = 'button';
    floatingButton.setAttribute('aria-label', '后台保活');
    floatingButton.setAttribute('aria-pressed', 'false');
    const floatingIcon = document.createElement('i');
    floatingIcon.className = 'fa-solid fa-volume-xmark';
    floatingIcon.setAttribute('aria-hidden', 'true');
    floatingButton.appendChild(floatingIcon);
    document.body.appendChild(floatingButton);

    const button = panel.querySelector('#rita-tt-android-keepalive-toggle');
    const status = panel.querySelector('#rita-tt-android-keepalive-status');
    const mode = panel.querySelector('#rita-tt-android-keepalive-mode');
    let playback = null;
    let pending = null;

    let saved = {};
    try {
        saved = JSON.parse(localStorage.getItem(panelId)) || {};
    } catch {
        // Storage can be unavailable in private or embedded contexts.
    }
    if (saved.mode === 'web-audio') mode.value = 'web-audio';

    function saveSettings(wasEnabled) {
        try {
            localStorage.setItem(panelId, JSON.stringify({ mode: mode.value, wasEnabled }));
        } catch {
            // The current page can still play audio without saving preferences.
        }
    }

    function setState(message, playing = false) {
        const enabled = playback !== null;
        mode.disabled = enabled;
        button.textContent = enabled ? '关闭保活' : '开启保活';
        button.setAttribute('aria-pressed', String(enabled));
        floatingButton.setAttribute('aria-pressed', String(enabled));
        floatingButton.classList.toggle('st-keepalive-on', playing);
        floatingIcon.classList.toggle('fa-volume-high', enabled);
        floatingIcon.classList.toggle('fa-volume-xmark', !enabled);
        status.textContent = message;
        status.classList.toggle('st-keepalive-on', playing);
    }

    function stop(message = '未开启', preserveResumeHint = false) {
        const previous = playback;
        playback = null;
        pending = null;
        previous?.dispose();
        if (!preserveResumeHint) saveSettings(false);
        setState(message);
    }

    function syncPlayback(current) {
        if (playback !== current) return;

        const playing = current.isPlaying();
        setState(playing ? '音频播放中' : '音频已暂停，回到酒馆时会尝试恢复。', playing);
    }

    function createWavPlayback() {
        const element = document.createElement('audio');
        element.loop = true;
        element.preload = 'auto';
        element.src = audioUrl.href;
        element.hidden = true;

        const current = {
            isPlaying: () => !element.paused,
            play: () => element.play(),
            dispose() {
                element.pause();
                element.removeAttribute('src');
                element.load();
                element.remove();
            },
        };

        element.addEventListener('pause', () => syncPlayback(current));
        element.addEventListener('playing', () => syncPlayback(current));
        element.addEventListener('error', () => {
            if (playback === current) stop('音频加载失败，请重试。');
        });
        document.body.appendChild(element);
        return current;
    }

    function createWebAudioPlayback() {
        const context = new AudioContext();
        const loading = new AbortController();
        let source = null;

        const current = {
            isPlaying: () => source !== null && context.state === 'running',
            async play() {
                // Request resume in the original click before loading any assets.
                const resume = context.resume();
                if (source) {
                    await resume;
                    return;
                }

                const decode = fetch(audioUrl, { signal: loading.signal })
                    .then(response => {
                        if (!response.ok) throw new Error('Keepalive audio could not be loaded');
                        return response.arrayBuffer();
                    })
                    .then(bytes => context.decodeAudioData(bytes));
                const [, buffer] = await Promise.all([resume, decode]);
                if (loading.signal.aborted) return;

                const loop = context.createBufferSource();
                loop.buffer = buffer;
                loop.loop = true;
                loop.connect(context.destination);
                loop.start();
                source = loop;
            },
            dispose() {
                loading.abort();
                if (source) {
                    source.stop();
                    source.disconnect();
                }
                if (context.state !== 'closed') void context.close().catch(() => {});
            },
        };

        context.addEventListener('statechange', () => {
            if (source) syncPlayback(current);
        });
        return current;
    }

    async function play() {
        const current = playback;
        if (!current || pending === current || current.isPlaying()) return;

        pending = current;
        setState('正在启动音频…');
        try {
            await current.play();
            syncPlayback(current);
        } catch (error) {
            if (playback === current) {
                stop(error.name === 'NotAllowedError' ? '请再次点击开启保活。' : '音频播放失败，请重试。');
            }
        } finally {
            if (pending === current) pending = null;
        }
    }

    function toggle() {
        if (playback) {
            stop();
            return;
        }

        if (mode.value === 'web-audio') {
            if (typeof AudioContext !== 'function') {
                setState('当前 WebView 不支持 Web Audio，请选择 WAV 循环。');
                return;
            }
            try {
                playback = createWebAudioPlayback();
            } catch {
                setState('Web Audio 无法启动，请重试或选择 WAV 循环。');
                return;
            }
        } else {
            playback = createWavPlayback();
        }

        saveSettings(true);
        void play();
    }

    function resumeOnReturn() {
        if (document.visibilityState === 'visible') void play();
    }

    if (saved.wasEnabled === true) setState('上次保活未关闭，请点击开启保活继续播放。');
    mode.addEventListener('change', () => {
        saveSettings(false);
        setState('未开启');
    });
    button.addEventListener('click', toggle);
    floatingButton.addEventListener('click', toggle);
    document.addEventListener('visibilitychange', resumeOnReturn);
    document.addEventListener('resume', resumeOnReturn);
    window.addEventListener('pageshow', resumeOnReturn);
    window.addEventListener('focus', resumeOnReturn);
    window.addEventListener('pagehide', (event) => {
        if (!event.persisted && playback) stop('未开启', true);
    });
})();
