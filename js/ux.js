/**
 * ux.js — Micro-interações e polimento do site "Rifa Donna Gina Moda Plus"
 *
 * Responsável por:
 *  - Toast global (window.showToast)
 *  - Ano automático no rodapé (#year)
 *  - Confetti leve (sem libs) ao 1º número e ao abrir o Pix
 *  - Helper de shake (window.shake)
 *  - Scroll suave para #numbers-grid via [data-scroll]
 *  - Máscara de telefone (00) 00000-0000 em #buyer-phone
 *  - Botão "Surpresa 🎲" (#btn-lucky): 1–5 números livres aleatórios
 *
 * Sem dependências. Respeita prefers-reduced-motion.
 */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Utilidades básicas
   * ------------------------------------------------------------------ */

  // Atalho para querySelector
  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  // Atalho para querySelectorAll (retorna array)
  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  // Usuário prefere menos movimento? Então nada de confetti/shake/scroll animado.
  var prefersReducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------ *
   * CSS injetado (confetti + shake) — assim funciona mesmo se o CSS
   * principal ainda não tiver essas animações.
   * ------------------------------------------------------------------ */

  function ensureStyles() {
    if (document.getElementById('ux-styles')) return;

    var style = document.createElement('style');
    style.id = 'ux-styles';
    style.textContent = [
      // Peças do confetti: caem de cima com rotação
      '.confetti-piece {',
      '  position: fixed;',
      '  top: -12px;',
      '  width: 8px;',
      '  height: 14px;',
      '  z-index: 9999;',
      '  pointer-events: none;',
      '  border-radius: 2px;',
      '  opacity: .95;',
      '  animation-name: ux-confetti-fall;',
      '  animation-timing-function: cubic-bezier(.2,.6,.4,1);',
      '  animation-fill-mode: forwards;',
      '}',
      '@keyframes ux-confetti-fall {',
      '  0%   { transform: translateY(0) rotate(0deg); opacity: 1; }',
      '  100% { transform: translateY(105vh) rotate(720deg); opacity: 0; }',
      '}',
      // Shake: balanço rápido para erros / feedback
      '.shake {',
      '  animation: ux-shake 0.45s ease-in-out;',
      '}',
      '@keyframes ux-shake {',
      '  0%, 100% { transform: translateX(0); }',
      '  20% { transform: translateX(-7px); }',
      '  40% { transform: translateX(7px); }',
      '  60% { transform: translateX(-5px); }',
      '  80% { transform: translateX(5px); }',
      '}',
      // Respeita reduced-motion também no CSS injetado
      '@media (prefers-reduced-motion: reduce) {',
      '  .confetti-piece, .shake { animation: none !important; }',
      '}'
    ].join('\n');

    document.head.appendChild(style);
  }

  /* ------------------------------------------------------------------ *
   * Toast global — window.showToast(msg)
   * Mostra #toast por 2.5s com a classe .show, limpando o timer anterior.
   * Garantimos aria-live para leitores de tela.
   * ------------------------------------------------------------------ */

  var toastTimer = null;

  function getOrCreateToast() {
    var toast = document.getElementById('toast');

    // Se o HTML ainda não trouxe o #toast, criamos um para não quebrar.
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.setAttribute('role', 'status');
      document.body.appendChild(toast);
    }

    // A11y: anuncia a mensagem sem roubar o foco.
    toast.setAttribute('aria-live', 'polite');
    toast.setAttribute('aria-atomic', 'true');
    if (!toast.getAttribute('role')) toast.setAttribute('role', 'status');

    return toast;
  }

  function showToast(msg) {
    if (!msg) return;
    var toast = getOrCreateToast();

    toast.textContent = msg;

    // Limpa o timer anterior: toasts seguidos reiniciam os 2.5s.
    if (toastTimer) {
      window.clearTimeout(toastTimer);
      toastTimer = null;
    }

    toast.classList.add('show');

    toastTimer = window.setTimeout(function () {
      toast.classList.remove('show');
      toastTimer = null;
    }, 2500);
  }

  window.showToast = showToast;

  /* ------------------------------------------------------------------ *
   * Ano automático no rodapé
   * ------------------------------------------------------------------ */

  function initYear() {
    var yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  }

  /* ------------------------------------------------------------------ *
   * Confetti simples (sem libs pesadas)
   * Cria 30 spans .confetti-piece caindo e remove tudo após 2s.
   * ------------------------------------------------------------------ */

  var CONFETTI_COLORS = ['#d6336c', '#f783ac', '#ffd43b', '#a5d8ff', '#69db7c', '#ffffff'];

  function confetti() {
    // Respeita quem prefere menos movimento.
    if (prefersReducedMotion) return;

    ensureStyles();

    var fragment = document.createDocumentFragment();

    for (var i = 0; i < 30; i++) {
      var piece = document.createElement('span');
      piece.className = 'confetti-piece';
      piece.setAttribute('aria-hidden', 'true');

      // Posição horizontal aleatória e cores da paleta Donna Gina.
      piece.style.left = (Math.random() * 100) + 'vw';
      piece.style.backgroundColor = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];

      // Variação de tempo/duração para um efeito mais natural.
      piece.style.animationDuration = (1.1 + Math.random() * 0.9) + 's';
      piece.style.animationDelay = (Math.random() * 0.25) + 's';

      // Alguns retângulos, alguns quadrados/arredondados.
      if (Math.random() > 0.6) piece.style.borderRadius = '50%';

      fragment.appendChild(piece);
    }

    document.body.appendChild(fragment);

    // Limpeza: remove todas as peças após 2s.
    window.setTimeout(function () {
      $$('.confetti-piece').forEach(function (el) {
        el.remove();
      });
    }, 2000);
  }

  // Expõe também como helper global (útil para outros scripts chamarem).
  window.confetti = confetti;

  /* ------------------------------------------------------------------ *
   * Shake — window.shake(el)
   * Reanima a classe .shake mesmo se ela já estiver aplicada.
   * ------------------------------------------------------------------ */

  function shake(el) {
    if (!el) return;
    ensureStyles();

    // Sem animação se o usuário prefere reduced-motion: só feedback visual.
    if (prefersReducedMotion) return;

    el.classList.remove('shake');

    // Força reflow para a animação poder rodar de novo.
    void el.offsetWidth;

    el.classList.add('shake');

    window.setTimeout(function () {
      el.classList.remove('shake');
    }, 500);
  }

  window.shake = shake;

  /* ------------------------------------------------------------------ *
   * Scroll suave para #numbers-grid ao clicar em CTA [data-scroll]
   * ------------------------------------------------------------------ */

  function initSmoothScroll() {
    $$('[data-scroll]').forEach(function (cta) {
      cta.addEventListener('click', function (event) {
        var target = cta.getAttribute('data-scroll') || '#numbers-grid';

        // Aceita tanto "#numbers-grid" quanto "numbers-grid".
        if (target && target.charAt(0) !== '#' && target.charAt(0) !== '.' && target.charAt(0) !== '[') {
          target = '#' + target;
        }

        var destination = $(target) || $('#numbers-grid');
        if (!destination) return; // Sem destino, deixa o comportamento padrão.

        event.preventDefault();
        destination.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
          block: 'start'
        });
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * Máscara simples de telefone: (00) 00000-0000
   * ------------------------------------------------------------------ */

  function formatPhone(digits) {
    // Remove tudo que não for número e limita a 11 dígitos (DDD + 9).
    digits = digits.replace(/\D/g, '').slice(0, 11);

    if (!digits) return '';

    // Formato progressivo enquanto digita.
    if (digits.length <= 2) return '(' + digits;
    if (digits.length <= 6) return '(' + digits.slice(0, 2) + ') ' + digits.slice(2);
    if (digits.length <= 10) return '(' + digits.slice(0, 2) + ') ' + digits.slice(2, 6) + '-' + digits.slice(6);
    return '(' + digits.slice(0, 2) + ') ' + digits.slice(2, 7) + '-' + digits.slice(7);
  }

  function initPhoneMask() {
    var input = document.getElementById('buyer-phone');
    if (!input) return;

    input.setAttribute('inputmode', 'tel');
    input.setAttribute('autocomplete', 'tel');
    if (!input.getAttribute('placeholder')) input.setAttribute('placeholder', '(00) 00000-0000');

    input.addEventListener('input', function () {
      input.value = formatPhone(input.value);
    });

    // Cola também passa pela máscara.
    input.addEventListener('paste', function () {
      window.setTimeout(function () {
        input.value = formatPhone(input.value);
      }, 0);
    });
  }

  /* ------------------------------------------------------------------ *
   * "Surpresa 🎲" (#btn-lucky)
   * Escolhe 1–5 números livres aleatórios e marca via window.Rifa.set([...]).
   * ------------------------------------------------------------------ */

  // Tenta descobrir os números livres por várias vias (API da rifa ou DOM).
  function getFreeNumbers() {
    var rifa = window.Rifa;

    // 1) API explícita da rifa, se existir.
    if (rifa) {
      var candidates = ['getFreeNumbers', 'getAvailableNumbers', 'getAvailable', 'freeNumbers'];
      for (var i = 0; i < candidates.length; i++) {
        if (typeof rifa[candidates[i]] === 'function') {
          var fromApi = rifa[candidates[i]]();
          if (Array.isArray(fromApi) && fromApi.length) return fromApi;
        }
      }
      if (Array.isArray(rifa.available)) return rifa.available;
      if (Array.isArray(rifa.freeNumbers)) return rifa.freeNumbers;
    }

    // 2) Fallback pelo DOM: botões da grade que não estão ocupados.
    return $$('#numbers-grid button, #numbers-grid [data-number]').filter(function (btn) {
      return !btn.disabled &&
        !btn.classList.contains('taken') &&
        !btn.classList.contains('sold') &&
        !btn.classList.contains('reserved') &&
        !btn.classList.contains('selected');
    }).map(function (btn) {
      var n = parseInt(btn.getAttribute('data-number') || btn.textContent, 10);
      return n;
    }).filter(function (n) {
      return !isNaN(n);
    });
  }

  // Embaralha (Fisher-Yates) sem mutar o array original chamador.
  function shuffle(array) {
    var copy = array.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function initLuckyButton() {
    var btn = document.getElementById('btn-lucky');
    if (!btn) return;

    btn.addEventListener('click', function () {
      var free = getFreeNumbers();

      if (!free.length) {
        shake(btn);
        showToast('Sem números livres no momento.');
        return;
      }

      // Entre 1 e 5 números (ou menos, se houver poucos livres).
      var qty = Math.min(free.length, 1 + Math.floor(Math.random() * 5));
      var lucky = shuffle(free).slice(0, qty);

      if (window.Rifa && typeof window.Rifa.set === 'function') {
        // Caminho oficial: delega ao módulo da rifa.
        window.Rifa.set(lucky);
      } else {
        // Fallback: marca no DOM para não deixar o usuário sem resposta.
        lucky.forEach(function (n) {
          var el = $('[data-number="' + n + '"]');
          if (el && !el.disabled) el.classList.add('selected');
        });
      }

      // Evento padrão do site (rifa.js também costuma emitir este).
      window.dispatchEvent(new CustomEvent('rifa:change', {
        detail: { selected: lucky, source: 'lucky' }
      }));

      showToast('Números da sorte escolhidos! 🍀');
    });
  }

  /* ------------------------------------------------------------------ *
   * Confetti ao selecionar o PRIMEIRO número
   * Ouve rifa:change; se a contagem sair de 0 para >0, celebra.
   * ------------------------------------------------------------------ */

  var lastSelectedCount = 0;

  function getSelectedCount(detail) {
    // Evento traz a lista? Usa ela.
    if (detail && Array.isArray(detail.selected)) return detail.selected.length;
    if (detail && typeof detail.count === 'number') return detail.count;

    // Senão, tenta a API da rifa.
    var rifa = window.Rifa;
    if (rifa) {
      if (typeof rifa.getSelected === 'function') {
        var viaApi = rifa.getSelected();
        if (Array.isArray(viaApi)) return viaApi.length;
      }
      if (typeof rifa.getSelectedNumbers === 'function') {
        var viaApi2 = rifa.getSelectedNumbers();
        if (Array.isArray(viaApi2)) return viaApi2.length;
      }
      if (Array.isArray(rifa.selected)) return rifa.selected.length;
    }

    // Último recurso: conta os selecionados no DOM.
    return $$('#numbers-grid .selected').length;
  }

  function initFirstSelectionConfetti() {
    window.addEventListener('rifa:change', function (event) {
      var now = getSelectedCount(event && event.detail);

      // Transição 0 -> algum: é o primeiro número!
      if (lastSelectedCount === 0 && now > 0) confetti();

      lastSelectedCount = now;
    });

    // Fallback silencioso: se a rifa só mexe no DOM (sem evento),
    // observa a grade e dispara o mesmo comportamento.
    var grid = document.getElementById('numbers-grid');
    if (grid && 'MutationObserver' in window) {
      var observer = new MutationObserver(function () {
        var now = $$('#numbers-grid .selected').length;
        if (lastSelectedCount === 0 && now > 0) confetti();
        lastSelectedCount = now;
      });
      observer.observe(grid, { attributes: true, subtree: true, attributeFilter: ['class'] });
    }
  }

  /* ------------------------------------------------------------------ *
   * Confetti ao abrir o Pix
   * Clique em botões/links de Pix + eventos customizados pix:open.
   * ------------------------------------------------------------------ */

  function initPixConfetti() {
    var pixSelectors = [
      '[data-pix]',
      '[data-open-pix]',
      '[data-action="pix"]',
      '#btn-pix',
      '#open-pix',
      '.btn-pix',
      '[href*="pix"]'
    ];

    pixSelectors.forEach(function (selector) {
      $$(selector).forEach(function (el) {
        el.addEventListener('click', function () {
          confetti();
        });
      });
    });

    // Se o módulo do Pix emitir um evento, também celebramos.
    ['pix:open', 'pix:show', 'rifa:pix', 'pix:copied'].forEach(function (name) {
      window.addEventListener(name, function () {
        confetti();
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * Inicialização
   * ------------------------------------------------------------------ */

  function init() {
    ensureStyles();
    initYear();
    initSmoothScroll();
    initPhoneMask();
    initLuckyButton();
    initFirstSelectionConfetti();
    initPixConfetti();
  }

  // Se o DOM ainda está carregando, espera; senão, inicializa na hora.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
