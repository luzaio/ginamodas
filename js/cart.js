/**
 * cart.js — Resumo da rifa (rodapé sticky) + abertura do checkout.
 *
 * - Escuta o evento `window CustomEvent('rifa:change')` disparado por numbers.js
 *   com `detail: { selected, count, total }`.
 * - Atualiza `#total-count`, `#total-price`, `#selected-count` e `#selected-list`.
 * - Botão `#btn-checkout`: valida seleção, abre `#checkout-modal`, trava scroll e foca `#buyer-name`.
 * - Exporta `window.Cart = { refresh(selected) }`.
 *
 * Sem libs. Comentários em pt-BR.
 */
(function () {
  'use strict';

  /* Ids usados no HTML (se existirem, são atualizados). */
  var ID_TOTAL_COUNT = 'total-count';
  var ID_TOTAL_PRICE = 'total-price';
  var ID_SELECTED_COUNT = 'selected-count';
  var ID_SELECTED_LIST = 'selected-list';
  var ID_CHECKOUT_BTN = 'btn-checkout';
  var ID_CLEAR_BTN = 'btn-clear-selected';
  var ID_MODAL = 'checkout-modal';
  var ID_BUYER_NAME = 'buyer-name';
  var ID_SUMMARY_BAR = 'summary-bar';

  /* Estado local: números selecionados (ordenados, sem duplicatas). */
  var selected = [];

  /* ---------- utilidades ---------- */

  /** Atalho para document.getElementById com segurança. */
  function $(id) {
    return document.getElementById(id);
  }

  /** Preço por número vindo de RIFA_CONFIG (fallback: 10). */
  function getPrecoPorNumero() {
    var cfg = window.RIFA_CONFIG || {};
    var v = cfg.precoPorNumero;
    if (v === undefined && cfg.preco !== undefined) v = cfg.preco;
    if (v === undefined && cfg.valorPorNumero !== undefined) v = cfg.valorPorNumero;
    var n = Number(v);
    return isFinite(n) && n >= 0 ? n : 10;
  }

  /** Formata valor em BRL usando window.formatBRL ou fallback Intl. */
  function formatBRL(value) {
    if (typeof window.formatBRL === 'function') {
      try {
        return window.formatBRL(value);
      } catch (e) { /* cai para o fallback abaixo */ }
    }
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }

  /** Largura do zero à esquerda (ex.: 3 => "007"). */
  function padWidth() {
    var cfg = window.RIFA_CONFIG || {};
    if (cfg.padWidth) return Number(cfg.padWidth) || 3;
    if (cfg.width) return Number(cfg.width) || 3;
    if (cfg.totalNumeros) return String(Math.max(0, cfg.totalNumeros - 1)).length || 3;
    if (cfg.maxNumero) return String(cfg.maxNumero).length || 3;
    return 3;
  }

  /** Formata número com zero à esquerda, ex.: 7 => "007". */
  function padNumber(n) {
    return String(n).padStart(padWidth(), '0');
  }

  /** Normaliza entrada (array, Set ou detail { selected }) em array ordenado. */
  function normalize(input) {
    var arr = [];
    if (!input) return arr;
    if (input && typeof input === 'object' && !Array.isArray(input) && !(input instanceof Set)) {
      // Suporta receber o próprio detail do evento { selected, count, total }.
      if (Array.isArray(input.selected)) input = input.selected;
      else if (input.detail && Array.isArray(input.detail.selected)) input = input.detail.selected;
      else return arr;
    }
    arr = input instanceof Set ? Array.from(input) : Array.from(input);
    // Remove duplicados, garante número e ordena.
    return Array.from(new Set(arr.map(Number).filter(function (n) { return isFinite(n); }))).sort(function (a, b) { return a - b; });
  }

  /* ---------- estilo mínimo (shake / chips / toast fallback) ---------- */

  /**
   * Injeta CSS mínimo só se o site ainda não tiver.
   * Garante animação "shake" e chips mesmo sem stylesheet do cart.
   */
  function ensureStyles() {
    if ($('cart-styles')) return;
    var style = document.createElement('style');
    style.id = 'cart-styles';
    style.textContent = [
      '@keyframes rifa-shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}',
      '.rifa-shake{animation:rifa-shake .45s ease}',
      '.selected-list,.chip-list{display:flex;flex-wrap:wrap;gap:6px}',
      '.chip{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;font-size:.85em;line-height:1.2}',
      '.selected-empty{opacity:.75;font-size:.9em}',
      '#cart-toast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:9999;padding:10px 16px;border-radius:10px;background:#111;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.25);font-size:.95rem}'
    ].join('\n');
    document.head.appendChild(style);
  }

  /* ---------- toast ---------- */

  /** Mostra mensagem: usa window.showToast se existir, senão cria toast local. */
  function showToast(msg) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg);
      return;
    }
    var toast = $('cart-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'cart-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { toast.style.display = 'none'; }, 3000);
  }

  /** Efeito "shake" no botão/rodapé para feedback visual. */
  function shake() {
    var target = $(ID_CHECKOUT_BTN) || $(ID_SUMMARY_BAR);
    if (!target) return;
    target.classList.remove('rifa-shake');
    // Força reflow para reiniciar a animação em cliques seguidos.
    void target.offsetWidth;
    target.classList.add('rifa-shake');
    setTimeout(function () { target.classList.remove('rifa-shake'); }, 500);
  }

  /* ---------- modal de checkout ---------- */

  /** Retorna o modal de checkout, se existir no DOM. */
  function getModal() {
    return $(ID_MODAL);
  }

  /** Verifica se o modal está aberto. */
  function isModalOpen() {
    var m = getModal();
    if (!m) return false;
    return !m.classList.contains('hidden') && !m.hasAttribute('hidden');
  }

  /** Trava o scroll do body enquanto o modal está aberto. */
  function lockScroll(lock) {
    document.body.style.overflow = lock ? 'hidden' : '';
    document.documentElement.style.overflow = lock ? 'hidden' : '';
  }

  /** Abre o modal: remove `hidden`, trava scroll e foca #buyer-name. */
  function openModal() {
    var m = getModal();
    if (!m) return;
    m.classList.remove('hidden');
    m.removeAttribute('hidden');
    m.setAttribute('aria-hidden', 'false');
    m.classList.add('open');
    lockScroll(true);
    var field = $(ID_BUYER_NAME) || m.querySelector('input[name="name"], input');
    if (field) {
      // Pequeno atraso para a transição de abertura terminar.
      setTimeout(function () { field.focus({ preventScroll: true }); }, 50);
    }
  }

  /** Fecha o modal: adiciona `hidden`, liberta o scroll e devolve o foco. */
  function closeModal() {
    var m = getModal();
    if (!m) return;
    m.classList.add('hidden');
    m.setAttribute('hidden', '');
    m.setAttribute('aria-hidden', 'true');
    m.classList.remove('open');
    lockScroll(false);
    var btn = $(ID_CHECKOUT_BTN);
    if (btn && typeof btn.focus === 'function') btn.focus({ preventScroll: true });
  }

  /* ---------- seleção: atualizar / limpar / remover ---------- */

  /** Atualiza todos os elementos do resumo a partir da lista selecionada. */
  function refresh(input) {
    selected = normalize(input);
    var count = selected.length;
    var total = count * getPrecoPorNumero();

    var elCount = $(ID_TOTAL_COUNT);
    if (elCount) elCount.textContent = count + (count === 1 ? ' número' : ' números');

    var elSelectedCount = $(ID_SELECTED_COUNT);
    if (elSelectedCount) elSelectedCount.textContent = String(count);

    var elPrice = $(ID_TOTAL_PRICE);
    if (elPrice) elPrice.textContent = formatBRL(total);

    renderSelectedList();
    updateClearButton(count);
  }

  /** Renderiza a lista de chips dos números selecionados. */
  function renderSelectedList() {
    var list = $(ID_SELECTED_LIST);
    if (!list) return;
    list.innerHTML = '';

    if (selected.length === 0) {
      var empty = document.createElement('span');
      empty.className = 'selected-empty';
      empty.textContent = 'Nenhum número selecionado';
      // Se for <ul>/<ol>, embrulha em <li> para HTML válido.
      if (list.tagName === 'UL' || list.tagName === 'OL') {
        var li = document.createElement('li');
        li.appendChild(empty);
        list.appendChild(li);
      } else {
        list.appendChild(empty);
      }
      return;
    }

    // Mostra todos os números (sem limite) como chips.
    selected.forEach(function (n) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.number = String(n);
      chip.textContent = padNumber(n);
      chip.title = 'Remover número ' + padNumber(n);
      chip.setAttribute('aria-label', 'Remover número ' + padNumber(n));
      chip.addEventListener('click', function () { removeNumber(n); });

      if (list.tagName === 'UL' || list.tagName === 'OL') {
        var li = document.createElement('li');
        li.appendChild(chip);
        list.appendChild(li);
      } else {
        list.appendChild(chip);
      }
    });
  }

  /** Remove um número: tenta API do numbers.js, senão evento + limpeza do DOM. */
  function removeNumber(n) {
    // 1) API do numbers.js, se existir (ele disparará 'rifa:change').
    try {
      var N = window.Rifa || window.Numbers;
      if (N) {
        // numbers.js (window.Rifa) só tem set/clear: filtra a lista e reaplica
        if (typeof N.getSelected === 'function' && typeof N.set === 'function') {
          var current = N.getSelected();
          N.set((current || []).filter(function (x) { return Number(x) !== Number(n); }));
          return;
        }
        if (typeof N.toggle === 'function') { N.toggle(n); return; }
        if (typeof N.remove === 'function') { N.remove(n); return; }
        if (typeof N.deselect === 'function') { N.deselect(n); return; }
        if (typeof N.toggleNumber === 'function') { N.toggleNumber(n); return; }
      }
    } catch (e) { /* segue para o fallback */ }

    // 2) Eventos para o numbers.js ouvir.
    window.dispatchEvent(new CustomEvent('rifa:remove', { detail: { number: n } }));
    window.dispatchEvent(new CustomEvent('rifa:toggle', { detail: { number: n } }));

    // 3) Fallback: desmarca no DOM e atualiza o resumo local.
    var el = document.querySelector('[data-number="' + n + '"]');
    if (el) {
      el.classList.remove('selected', 'active');
      el.setAttribute('aria-pressed', 'false');
      if (el.checked !== undefined) el.checked = false;
    }
    refresh(selected.filter(function (x) { return x !== n; }));
    window.dispatchEvent(new CustomEvent('rifa:change', { detail: { selected: selected, count: selected.length, total: selected.length * getPrecoPorNumero() } }));
  }

  /** Limpa toda a seleção (botão #btn-clear-selected / "Limpar"). */
  function clearSelected() {
    // 1) API do numbers.js, se existir.
    try {
      var N = window.Rifa || window.Numbers;
      if (N) {
        if (typeof N.clear === 'function') { N.clear(); return; }
        if (typeof N.clearAll === 'function') { N.clearAll(); return; }
        if (typeof N.deselectAll === 'function') { N.deselectAll(); return; }
        if (typeof N.set === 'function') { N.set([]); return; }
      }
    } catch (e) { /* segue para o fallback */ }

    // 2) Evento para o numbers.js ouvir.
    window.dispatchEvent(new CustomEvent('rifa:clear'));

    // 3) Fallback: desmarca todos os números no DOM e atualiza o resumo.
    document.querySelectorAll('[data-number].selected, [data-number][aria-pressed="true"], .number.selected, input[data-number]:checked')
      .forEach(function (el) {
        el.classList.remove('selected', 'active');
        el.setAttribute('aria-pressed', 'false');
        if (el.checked !== undefined) el.checked = false;
      });
    refresh([]);
    window.dispatchEvent(new CustomEvent('rifa:change', { detail: { selected: [], count: 0, total: 0 } }));
  }

  /* ---------- botão "Limpar" ---------- */

  /** Habilita/desabilita o botão Limpar conforme há seleção. */
  function updateClearButton(count) {
    var btn = $(ID_CLEAR_BTN);
    if (!btn) return;
    // Mantém clicável para não esconder layout; apenas reflete estado.
    btn.disabled = count === 0;
  }

  /** Conecta botão existente ou cria dinamicamente na summary-bar. */
  function ensureClearButton() {
    var btn = $(ID_CLEAR_BTN);
    if (!btn) {
      var bar = $(ID_SUMMARY_BAR);
      if (!bar) return;
      btn = document.createElement('button');
      btn.id = ID_CLEAR_BTN;
      btn.type = 'button';
      btn.className = 'btn btn-clear-selected';
      btn.textContent = 'Limpar';
      bar.appendChild(btn);
    }
    if (btn.dataset.cartBound === '1') return;
    btn.dataset.cartBound = '1';
    btn.addEventListener('click', clearSelected);
    updateClearButton(selected.length);
  }

  /* ---------- botão checkout ---------- */

  /** Clique em #btn-checkout: valida e abre o modal. */
  function onCheckoutClick() {
    if (selected.length === 0) {
      showToast('Escolha ao menos 1 número 👑');
      shake();
      return;
    }
    openModal();
  }

  /** Conecta o botão de checkout (uma única vez). */
  function ensureCheckoutButton() {
    var btn = $(ID_CHECKOUT_BTN);
    if (!btn || btn.dataset.cartBound === '1') return;
    btn.dataset.cartBound = '1';
    btn.addEventListener('click', onCheckoutClick);
  }

  /* ---------- acessibilidade: ESC / clique no backdrop ---------- */

  /**
   * fallback seguro para ESC fechar o modal.
   * Se checkout.js já trata, delega para window.Checkout.close quando disponível.
   */
  function onKeyDown(e) {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    if (!isModalOpen()) return;
    if (window.Checkout && typeof window.Checkout.close === 'function') {
      window.Checkout.close();
    } else {
      closeModal();
    }
  }

  /** Clicar no backdrop (fora do conteúdo) fecha o modal. */
  function onModalBackdropClick(e) {
    if (e.target !== getModal()) return;
    if (window.Checkout && typeof window.Checkout.close === 'function') {
      window.Checkout.close();
    } else {
      closeModal();
    }
  }

  /* ---------- inicialização ---------- */

  /** Liga eventos, cria botão Limpar e pinta o resumo inicial. */
  function init() {
    ensureStyles();
    ensureClearButton();
    ensureCheckoutButton();

    var m = getModal();
    if (m) m.addEventListener('click', onModalBackdropClick);

    // Estado inicial: tenta ler do numbers.js, senão começa vazio.
    var initial = [];
    try {
      var api = window.Rifa || window.Numbers;
      if (api && typeof api.getSelected === 'function') initial = api.getSelected();
      else if (api && Array.isArray(api.selected)) initial = api.selected;
    } catch (e) { /* ignora e começa vazio */ }
    refresh(initial);
  }

  // Escuta mudanças vindas do numbers.js: detail { selected, count, total }.
  window.addEventListener('rifa:change', function (e) {
    refresh(e.detail ? e.detail.selected : []);
  });

  // ESC global (uma única vez).
  document.addEventListener('keydown', onKeyDown);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // API pública do cart.
  window.Cart = { refresh: refresh, clear: clearSelected, openModal: openModal, closeModal: closeModal };
})();
