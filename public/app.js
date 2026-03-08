(function () {
  const VIEW_MODE_KEY = 'screen-mirror-vr-view-mode';

  let config = { stunUrl: null, port: 3000, localIps: [] };
  let ws = null;
  let peerConnection = null;
  let localStream = null;
  let senderIceQueue = [];
  let receiverIceQueue = [];
  let senderCreatingOffer = false;

  const els = {
    chooseRole: document.getElementById('choose-role'),
    senderPanel: document.getElementById('sender-panel'),
    receiverPanel: document.getElementById('receiver-panel'),
    btnReload: document.getElementById('btn-reload'),
    btnSender: document.getElementById('btn-sender'),
    btnReceiver: document.getElementById('btn-receiver'),
    btnStartShare: document.getElementById('btn-start-share'),
    btnStopShare: document.getElementById('btn-stop-share'),
    senderStatus: document.getElementById('sender-status'),
    mobileUrlBox: document.getElementById('mobile-url-box'),
    mobileUrl: document.getElementById('mobile-url'),
    btnStartReceive: document.getElementById('btn-start-receive'),
    receiverStatus: document.getElementById('receiver-status'),
    videoContainer: document.getElementById('video-container'),
    viewNormal: document.getElementById('view-normal'),
    viewSbs: document.getElementById('view-sbs'),
    videoNormal: document.getElementById('video-normal'),
    videoSbsLeft: document.getElementById('video-sbs-left'),
    videoSbsRight: document.getElementById('video-sbs-right'),
    viewMode: document.getElementById('view-mode'),
    btnFullscreen: document.getElementById('btn-fullscreen'),
    error: document.getElementById('error'),
  };

  function showError(msg) {
    els.error.textContent = msg;
    els.error.classList.remove('hidden');
  }

  function clearError() {
    els.error.classList.add('hidden');
    els.error.textContent = '';
  }

  function show(el) {
    if (el) el.classList.remove('hidden');
  }
  function hide(el) {
    if (el) el.classList.add('hidden');
  }

  async function loadConfig() {
    try {
      const base = location.origin;
      const r = await fetch(base + '/config');
      config = await r.json();
    } catch (e) {
      config = { stunUrl: null, port: parseInt(location.port || '3000', 10), localIps: [] };
    }
  }

  function getWsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + location.host;
  }

  function getIceServers() {
    const servers = [];
    if (config.stunUrl) {
      servers.push({ urls: config.stunUrl });
    }
    return servers;
  }

  function buildMobileUrl() {
    const proto = location.protocol;
    const port = config.port || location.port || 3000;
    const ip = config.localIps && config.localIps[0];
    if (ip) return `${proto}//${ip}:${port}`;
    return `${proto}//${location.hostname}:${port}`;
  }

  // --- Sender ---
  function stopTracks() {
    if (peerConnection) {
      peerConnection.getSenders().forEach(function (s) {
        if (s.track) s.track.stop();
      });
      peerConnection.close();
      peerConnection = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(function (t) {
        t.stop();
      });
      localStream = null;
    }
  }

  async function startSender() {
    clearError();
    senderIceQueue = [];
    els.senderStatus.textContent = 'Pidiendo permiso para capturar pantalla…';
    try {
      localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    } catch (e) {
      els.senderStatus.textContent = '';
      if (e.name === 'NotAllowedError') {
        showError('Permiso denegado o cancelado.');
      } else {
        showError('Error al capturar pantalla: ' + (e.message || String(e)));
      }
      return;
    }

    ws = new WebSocket(getWsUrl());
    ws.onopen = function () {
      ws.send(JSON.stringify({ type: 'role', role: 'sender' }));
      setupSenderPeerConnection();
    };
    ws.onmessage = function (ev) {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      if (msg.type === 'sender_rejected') {
        els.senderStatus.textContent = '';
        showError('Ya hay otra sesión compartiendo. Solo se permite un emisor.');
        if (ws) {
          ws.close();
          ws = null;
        }
        stopTracks();
        hide(els.mobileUrlBox);
        return;
      }
      if (msg.type === 'receiver_ready' && localStream) {
        if (senderCreatingOffer) {
          console.log('[Sender] Already creating offer, ignoring duplicate receiver_ready');
          return;
        }
        console.log('[Sender] Receiver ready, creating new offer');
        els.senderStatus.textContent = 'Reconectando…';
        if (peerConnection) {
          try {
            peerConnection.close();
          } catch (e) {}
          peerConnection = null;
        }
        senderIceQueue = [];
        senderCreatingOffer = true;
        setupSenderPeerConnection();
        return;
      }
      if (msg.type === 'answer' && msg.sdp && peerConnection) {
        console.log('[Sender] Answer received');
        peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp))
          .then(function () {
            senderIceQueue.forEach(function (c) {
              peerConnection.addIceCandidate(new RTCIceCandidate(c)).catch(function (err) {
                console.warn('Sender addIceCandidate:', err);
              });
            });
            senderIceQueue = [];
          })
          .catch(function (e) {
            showError('Error al establecer respuesta: ' + (e.message || String(e)));
            console.error('Sender setRemoteDescription:', e);
          });
      } else if (msg.type === 'ice' && msg.candidate && peerConnection) {
        if (peerConnection.remoteDescription) {
          peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(function (err) {
            console.warn('Sender addIceCandidate:', err);
          });
        } else {
          senderIceQueue.push(msg.candidate);
        }
      }
    };
    ws.onclose = function () {
      senderCreatingOffer = false;
      els.senderStatus.textContent = 'Conexión cerrada.';
      hide(els.mobileUrlBox);
      stopTracks();
    };
    ws.onerror = function () {
      showError('Error de conexión WebSocket.');
    };

    els.senderStatus.textContent = 'Conectando con el receptor…';
    els.mobileUrl.value = buildMobileUrl();
    show(els.mobileUrlBox);
  }

  function setupSenderPeerConnection() {
    const pc = new RTCPeerConnection({ iceServers: getIceServers() });

    localStream.getTracks().forEach(function (track) {
      pc.addTrack(track, localStream);
    });

    pc.onicecandidate = function (ev) {
      if (ev.candidate && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ice', candidate: ev.candidate }));
      }
    };

    pc.onconnectionstatechange = function () {
      console.log('[Sender] Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        els.senderStatus.textContent = 'Compartiendo pantalla.';
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        // Mantener WebSocket abierto: cuando un nuevo receptor se conecte, el servidor enviará receiver_ready
        els.senderStatus.textContent = 'Reconectando…';
      }
    };

    pc.createOffer()
      .then(function (offer) {
        return pc.setLocalDescription(offer);
      })
      .then(function () {
        senderCreatingOffer = false;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'offer', sdp: pc.localDescription }));
          console.log('[Sender] Offer sent');
        }
      })
      .catch(function (e) {
        senderCreatingOffer = false;
        showError('Error al crear oferta: ' + (e.message || String(e)));
        console.error('[Sender] createOffer failed', e);
        stopTracks();
      });

    peerConnection = pc;
  }

  function stopShare() {
    senderCreatingOffer = false;
    if (ws) {
      ws.close();
      ws = null;
    }
    stopTracks();
    els.senderStatus.textContent = '';
    hide(els.mobileUrlBox);
  }

  // --- Receiver ---
  function setReceiverViewMode(mode) {
    if (mode === 'sbs') {
      hide(els.viewNormal);
      show(els.viewSbs);
    } else {
      show(els.viewNormal);
      hide(els.viewSbs);
    }
  }

  function applyStreamToReceiver(stream) {
    els.videoNormal.srcObject = stream;
    els.videoSbsLeft.srcObject = stream;
    els.videoSbsRight.srcObject = stream;
  }

  async function startReceiver() {
    clearError();
    receiverIceQueue = [];
    els.receiverStatus.textContent = 'Conectando…';

    const savedMode = localStorage.getItem(VIEW_MODE_KEY) || 'normal';
    els.viewMode.value = savedMode;
    setReceiverViewMode(savedMode);

    var requestOfferTimeoutId;
    ws = new WebSocket(getWsUrl());
    ws.onopen = function () {
      ws.send(JSON.stringify({ type: 'role', role: 'receiver' }));
      requestOfferTimeoutId = setTimeout(function () {
        requestOfferTimeoutId = null;
        if (!peerConnection && ws && ws.readyState === WebSocket.OPEN) {
          console.log('[Receiver] No offer yet, sending request_offer');
          ws.send(JSON.stringify({ type: 'request_offer' }));
        }
      }, 1500);
    };
    ws.onmessage = function (ev) {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      if (msg.type === 'receiver_rejected') {
        if (requestOfferTimeoutId) {
          clearTimeout(requestOfferTimeoutId);
          requestOfferTimeoutId = null;
        }
        showError('Ya hay otro dispositivo viendo la pantalla. Solo se permite un receptor.');
        els.receiverStatus.textContent = 'Conexión rechazada.';
        ws.close();
        return;
      }
      if (msg.type === 'offer') {
        if (requestOfferTimeoutId) {
          clearTimeout(requestOfferTimeoutId);
          requestOfferTimeoutId = null;
        }
        console.log('[Receiver] Offer received');
        handleOffer(msg.sdp);
      } else if (msg.type === 'ice' && msg.candidate) {
        if (peerConnection) {
          if (peerConnection.remoteDescription) {
            peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(function (err) {
              console.warn('Receiver addIceCandidate:', err);
            });
          } else {
            receiverIceQueue.push(msg.candidate);
          }
        }
      }
    };
    ws.onclose = function () {
      els.receiverStatus.textContent = 'Desconectado.';
      if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
      }
      els.videoNormal.srcObject = null;
      els.videoSbsLeft.srcObject = null;
      els.videoSbsRight.srcObject = null;
      hide(els.videoContainer);
    };
    ws.onerror = function () {
      showError('Error de conexión WebSocket.');
    };
  }

  function handleOffer(sdp) {
    // Cerrar conexión anterior si existe (reconexión)
    if (peerConnection) {
      try {
        peerConnection.close();
      } catch (e) {}
      peerConnection = null;
    }
    // Asegurar formato SDP: puede llegar como objeto { type, sdp } o ya serializado
    var sdpObj = sdp;
    if (typeof sdp === 'string') {
      try {
        sdpObj = JSON.parse(sdp);
      } catch (e) {
        sdpObj = { type: 'offer', sdp: sdp };
      }
    }
    if (sdpObj && typeof sdpObj.sdp === 'string' && !sdpObj.type) {
      sdpObj.type = 'offer';
    }
    const pc = new RTCPeerConnection({ iceServers: getIceServers() });

    pc.ontrack = function (ev) {
      if (ev.streams && ev.streams[0]) {
        applyStreamToReceiver(ev.streams[0]);
        show(els.videoContainer);
        els.receiverStatus.textContent = 'Viendo pantalla.';
      }
    };

    pc.onicecandidate = function (ev) {
      if (ev.candidate && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ice', candidate: ev.candidate }));
      }
    };

    pc.onconnectionstatechange = function () {
      console.log('[Receiver] Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        els.receiverStatus.textContent = 'Viendo pantalla.';
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        els.receiverStatus.textContent = 'Desconectado.';
      }
    };

    peerConnection = pc;

    function flushReceiverIceQueue() {
      receiverIceQueue.forEach(function (c) {
        pc.addIceCandidate(new RTCIceCandidate(c)).catch(function (err) {
          console.warn('Receiver addIceCandidate:', err);
        });
      });
      receiverIceQueue = [];
    }

    pc.setRemoteDescription(new RTCSessionDescription(sdpObj))
      .then(function () {
        flushReceiverIceQueue();
        return pc.createAnswer();
      })
      .then(function (answer) {
        return pc.setLocalDescription(answer);
      })
      .then(function () {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'answer', sdp: pc.localDescription }));
          console.log('[Receiver] Answer sent');
        }
      })
      .catch(function (e) {
        showError('Error en receptor: ' + (e.message || String(e)));
        console.error('[Receiver] handleOffer failed', e);
      });
  }

  // --- UI ---
  function updateReloadButtonVisibility() {
    if (els.senderPanel.classList.contains('hidden') && els.receiverPanel.classList.contains('hidden')) {
      hide(els.btnReload);
    } else {
      show(els.btnReload);
    }
  }

  function isFullscreen(el) {
    var fs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    return !!(fs && el && fs === el);
  }

  function isInFullscreen() {
    return isFullscreen(els.videoContainer);
  }

  function toggleFullscreen() {
    var container = els.videoContainer;
    if (!container) return;
    if (isInFullscreen()) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
      else if (document.msExitFullscreen) document.msExitFullscreen();
    } else {
      var req = container.requestFullscreen || container.webkitRequestFullscreen ||
        container.mozRequestFullScreen || container.msRequestFullscreen;
      if (req) {
        var p = req.call(container);
        if (p && typeof p.catch === 'function') {
          p.catch(function (err) {
            console.warn('[Fullscreen] Error:', err);
          });
        }
      }
    }
  }

  function updateFullscreenButtonLabel() {
    if (!els.btnFullscreen) return;
    els.btnFullscreen.textContent = isInFullscreen() ? 'Salir de pantalla completa' : 'Pantalla completa';
  }

  document.addEventListener('fullscreenchange', updateFullscreenButtonLabel);
  document.addEventListener('webkitfullscreenchange', updateFullscreenButtonLabel);
  document.addEventListener('mozfullscreenchange', updateFullscreenButtonLabel);
  document.addEventListener('MSFullscreenChange', updateFullscreenButtonLabel);

  els.btnReload.addEventListener('click', function () {
    location.reload();
  });

  if (els.btnFullscreen) {
    els.btnFullscreen.addEventListener('click', function () {
      toggleFullscreen();
    });
  }

  els.btnSender.addEventListener('click', function () {
    hide(els.chooseRole);
    show(els.senderPanel);
    updateReloadButtonVisibility();
  });

  els.btnReceiver.addEventListener('click', function () {
    hide(els.chooseRole);
    show(els.receiverPanel);
    updateReloadButtonVisibility();
  });

  els.btnStartShare.addEventListener('click', function () {
    startSender();
  });

  els.btnStopShare.addEventListener('click', function () {
    stopShare();
  });

  els.btnStartReceive.addEventListener('click', function () {
    startReceiver();
  });

  els.viewMode.addEventListener('change', function () {
    const mode = els.viewMode.value;
    localStorage.setItem(VIEW_MODE_KEY, mode);
    setReceiverViewMode(mode);
  });

  loadConfig();
})();
