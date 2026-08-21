function PresentMode(props) {
    var classroom = props.classroom;
    var material = props.material;

    var s1 = React.useState(null); var session = s1[0], setSession = s1[1];
    var s2 = React.useState(false); var listening = s2[0], setListening = s2[1];
    var s3 = React.useState([]); var matchHistory = s3[0], setMatchHistory = s3[1];
    var s4 = React.useState(false); var ending = s4[0], setEnding = s4[1];
    var s5 = React.useState(false); var hasNewMatch = s5[0], setHasNewMatch = s5[1];
    var s6 = React.useState(1); var page = s6[0], setPage = s6[1];
    var s7 = React.useState(false); var isFullscreen = s7[0], setIsFullscreen = s7[1];
    var s8 = React.useState(false); var postingSummary = s8[0], setPostingSummary = s8[1];
    var s9 = React.useState(''); var toast = s9[0], setToast = s9[1];
    var s10 = React.useState([]); var pinnedVisuals = s10[0], setPinnedVisuals = s10[1];
    var s12 = React.useState(false); var controlsOpen = s12[0], setControlsOpen = s12[1];
    var s13 = React.useState(false); var isSlideshow = s13[0], setIsSlideshow = s13[1];

    var recognitionRef = React.useRef(null);
    var bufferRef = React.useRef('');
    var intervalRef = React.useRef(null);
    var listeningRef = React.useRef(false);
    var sessionRef = React.useRef(null);
    var fsRef = React.useRef(null);
    var pdfWrapRef = React.useRef(null);
    var slideshowIntervalRef = React.useRef(null);

    var numPages = material.numPages || 1;

    React.useEffect(function () {
        apiFetch('/session/start', 'POST', { classroomId: classroom.id, materialId: material.id })
            .then(function (s) { setSession(s); sessionRef.current = s; })
            .catch(function (e) { alert('Could not start session: ' + e.message); });

        function handleFsChange() {
            var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
            setIsFullscreen(!!fsEl);
        }
        document.addEventListener('fullscreenchange', handleFsChange);
        document.addEventListener('webkitfullscreenchange', handleFsChange);

        return function () {
            stopListening();
            if (slideshowIntervalRef.current) clearInterval(slideshowIntervalRef.current);
            document.removeEventListener('fullscreenchange', handleFsChange);
            document.removeEventListener('webkitfullscreenchange', handleFsChange);
        };
    }, []);

    function showToast(msg) { setToast(msg); setTimeout(function () { setToast(''); }, 2500); }

    function flushBuffer() {
        var s = sessionRef.current;
        if (!s) return;
        var text = bufferRef.current.trim();
        if (!text) return;
        bufferRef.current = '';
        apiFetch('/session/' + s.id + '/match', 'POST', { transcriptChunk: text })
            .then(function (res) {
                if (res.matched) {
                    setMatchHistory(function (prev) {
                        var filtered = prev.filter(function (p) { return p.topic !== res.topic; });
                        var updated = [{ topic: res.topic, score: res.score, flashcards: res.flashcards, quiz: res.quiz, timestamp: Date.now() }].concat(filtered);
                        return updated.slice(0, 8);
                    });
                    setHasNewMatch(true);
                }
            })
            .catch(function (e) { console.log('match error', e.message); });
    }

    function startListening() {
        var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { alert('Speech recognition not supported. Use Chrome.'); return; }
        var recognition = new SR();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        recognition.onresult = function (event) {
            for (var i = event.resultIndex; i < event.results.length; i++) {
                bufferRef.current += ' ' + event.results[i][0].transcript;
            }
        };
        recognition.onerror = function (e) { console.log('speech error', e.error); };
        recognition.onend = function () { if (listeningRef.current) { try { recognition.start(); } catch (e) { } } };
        recognition.start();
        recognitionRef.current = recognition;
        listeningRef.current = true;
        setListening(true);
        intervalRef.current = setInterval(flushBuffer, 12000);
    }

    function stopListening() {
        listeningRef.current = false;
        if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch (e) { } }
        if (intervalRef.current) clearInterval(intervalRef.current);
        setListening(false);
    }

    function postSummaryNow() {
        var s = sessionRef.current;
        if (!s) return;
        setPostingSummary(true);
        apiFetch('/session/' + s.id + '/summary', 'POST')
            .then(function () { showToast('✅ Summary posted to classroom stream!'); })
            .catch(function (e) { alert('Error posting summary: ' + e.message); })
            .finally(function () { setPostingSummary(false); });
    }

    function endClass() {
        var s = sessionRef.current;
        if (!s) return;
        stopListening();
        setEnding(true);
        apiFetch('/session/' + s.id + '/end', 'POST')
            .then(function () { alert('Class ended! AI Summary auto-generated and posted.'); props.onExit(); })
            .catch(function (e) { alert('Error ending class: ' + e.message); })
            .finally(function () { setEnding(false); });
    }

    function exitWithoutSummary() { stopListening(); props.onExit(); }

    function sendQuizToStudents(topic, quiz) {
        var s = sessionRef.current;
        if (!s) return;
        apiFetch('/session/' + s.id + '/post-quiz', 'POST', { topic: topic, quiz: quiz })
            .then(function () { showToast('📤 Quiz sent to students!'); })
            .catch(function (e) { alert('Error sending quiz: ' + e.message); });
    }

    function toggleFullscreen() {
        var el = fsRef.current;
        if (!el) return;
        var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
        if (!fsEl) {
            if (el.requestFullscreen) el.requestFullscreen();
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
    }

    function prevPage() { setPage(function (p) { return Math.max(1, p - 1); }); }
    function nextPage() { setPage(function (p) { return Math.min(numPages, p + 1); }); }

    function toggleSlideshow() {
        if (isSlideshow) {
            if (slideshowIntervalRef.current) clearInterval(slideshowIntervalRef.current);
            setIsSlideshow(false);
        } else {
            setIsSlideshow(true);
            slideshowIntervalRef.current = setInterval(function () {
                setPage(function (p) { return p < numPages ? p + 1 : 1; });
            }, 5000);
        }
    }

    function handleDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }

    function pinCardAt(card, x, y) {
        // If this exact card is already pinned, just reposition it.
        setPinnedVisuals(function (prev) {
            var existing = prev.find(function (v) { return v.id === card.id && v.type === card.type; });
            if (existing) {
                return prev.map(function (v) {
                    return v.id === card.id && v.type === card.type
                        ? Object.assign({}, v, { x: x, y: y })
                        : v;
                });
            }
            var newPin = Object.assign({}, card, {
                pinId: 'pin-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
                x: x, y: y,
            });
            return prev.concat([newPin]);
        });
    }

    function handleDrop(e) {
        e.preventDefault();
        var raw = e.dataTransfer.getData('application/json');
        if (!raw) return;
        var card;
        try { card = JSON.parse(raw); } catch (err) { return; }
        var rect = e.currentTarget.getBoundingClientRect();
        var x = Math.max(0, e.clientX - rect.left - 140);
        var y = Math.max(0, e.clientY - rect.top - 20);
        pinCardAt(card, x, y);
    }

    // Called by the "📤 Present to class" button inside the AI panel.
    function presentCard(card) {
        if (!card) return;
        var el = pdfWrapRef.current;
        if (!el) {
            // No slide area mounted; just open source as a fallback.
            if (card.url && card.url !== '#') window.open(card.url, '_blank', 'noopener');
            return;
        }
        var rect = el.getBoundingClientRect();
        // Center the pinned visual on the slide.
        var boxW = card.kind === 'image' ? 360 : card.kind === 'video' ? 480 : 420;
        var boxH = card.kind === 'image' ? 280 : card.kind === 'video' ? 300 : 280;
        var x = Math.max(10, (rect.width - boxW) / 2);
        var y = Math.max(10, (rect.height - boxH) / 2);
        pinCardAt(card, x, y);
        showToast('📌 ' + (card.title || 'Visual') + ' pinned to slide');
    }

    function removePinned(pinId) {
        setPinnedVisuals(function (prev) { return prev.filter(function (v) { return v.pinId !== pinId; }); });
    }

    function handlePinDragStart(e, pin) {
        e.dataTransfer.setData('application/json', JSON.stringify(pin));
        e.dataTransfer.effectAllowed = 'move';
    }

    var pdfSrc = material.fileUrl + '#page=' + page;

    return (
        <div className="present-wrap">
            <div className={"present-fullscreen-target" + (isFullscreen ? " fullscreen-active" : "")} ref={fsRef}>

                {!isFullscreen && (
                    <div className="slide-toolbar">
                        <div className="slide-nav">
                            <button className="btn secondary sm" onClick={exitWithoutSummary}>← Back</button>
                            <button className="btn secondary sm" onClick={prevPage} disabled={page <= 1}>◀ Prev</button>
                            <span className="slide-page-indicator">Page {page} / {numPages}</span>
                            <button className="btn secondary sm" onClick={nextPage} disabled={page >= numPages}>Next ▶</button>
                            <button className="btn secondary sm" onClick={toggleSlideshow}>
                                {isSlideshow ? '⏸ Stop Slideshow' : '▶ Slideshow'}
                            </button>
                        </div>
                        <button className="btn secondary sm" onClick={toggleFullscreen}>⛶ Fullscreen</button>
                    </div>
                )}

                <div className="pdf-frame-wrap" ref={pdfWrapRef} onDragOver={handleDragOver} onDrop={handleDrop}>
                    <iframe title="pdf" src={pdfSrc} className="pdf-frame"></iframe>
                    {pinnedVisuals.map(function (pin) {
                        var isMedia = pin.kind === 'image' || pin.kind === 'video';
                        var boxClass = "pinned-visual-box" + (isMedia ? " media" : "");
                        return (
                            <div key={pin.pinId} className={boxClass} style={{ left: pin.x + 'px', top: pin.y + 'px' }}
                                draggable={true} onDragStart={function (e) { handlePinDragStart(e, pin); }}>
                                <div className="pinned-visual-header">
                                    <span>{pin.title}</span>
                                    <button onClick={function () { removePinned(pin.pinId); }}>✕</button>
                                </div>
                                <div className="pinned-visual-body">
                                    {pin.embeddable && pin.kind === 'image' ? (
                                        <img src={pin.url} alt={pin.title} />
                                    ) : pin.embeddable && pin.kind === 'video' ? (
                                        <video src={pin.url} controls autoPlay poster={pin.poster || ''}></video>
                                    ) : pin.embeddable ? (
                                        <iframe title={pin.title} src={pin.url} allow="autoplay; fullscreen"></iframe>
                                    ) : (
                                        <div className="no-embed">
                                            <div>🔎 {pin.title}</div>
                                            {pin.url && pin.url !== '#' && (
                                                <a href={pin.url} target="_blank" rel="noopener noreferrer" className="no-embed-link">Open source ↗</a>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="fab-stack-right">
                    <AIPanel
                        matchHistory={matchHistory}
                        pdfTopics={material.chunks || []}
                        hasNewMatch={hasNewMatch}
                        onOpened={function () { setHasNewMatch(false); }}
                        onSendQuiz={sendQuizToStudents}
                        onPresentCard={presentCard}
                    />

                    {isFullscreen ? (
                        <button className="round-fab summary-quick" onClick={postSummaryNow} disabled={postingSummary} title="Post Summary">
                            {postingSummary ? '...' : '📤'}
                        </button>
                    ) : (
                        <div className="fab-wrap">
                            <button className="round-fab controls" onClick={function () { setControlsOpen(!controlsOpen); }} title="Class Controls">
                                <ControlsIcon size={26} />
                            </button>
                            {controlsOpen && (
                                <div className="fab-popup-menu">
                                    <button className={"btn" + (listening ? " btn-recording" : "")} onClick={function () { listening ? stopListening() : startListening(); }}>
                                        {listening ? '🔴 Stop AI Listening' : '🎙️ Start AI Listening'}
                                    </button>
                                    <button className="btn secondary" onClick={postSummaryNow} disabled={postingSummary}>
                                        {postingSummary ? 'Posting...' : '📤 Post Summary'}
                                    </button>
                                    <button className="btn danger" onClick={endClass} disabled={ending}>
                                        {ending ? 'Ending...' : '🔚 End Class & Exit'}
                                    </button>
                                    <button className="btn secondary" onClick={exitWithoutSummary}>🚪 Exit (no summary)</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {toast && <div className="toast-msg">{toast}</div>}
            </div>
        </div>
    );
}
