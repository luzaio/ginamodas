/**
 * checkout.js — Rifa Donna Gina Moda Plus
 * Modal de checkout básico: Pix + SigiloPay (com fallback WhatsApp).
 *
 * Dependências (carregar antes deste arquivo):
 *  - js/config.js   → window.RIFA_CONFIG { precoPorNumero }, window.SIGILO_CONFIG { modoDemo }
 *  - js/numbers.js  → window.Rifa.getSelected(), evento 'rifa:change'
 *  - js/sigilopay.js → window.SigiloPay.createPix({ amount, buyer, description })
 *
 * IDs esperados no HTML:
 *  #checkout-modal, #checkout-form, #pix-result, #pix-qr, #pix-code,
 *  #btn-copy-pix, #btn-close-checkout, #btn-pay-pix,
 *  #buyer-name, #buyer-phone, #buyer-email,
 *  #checkout-total, #checkout-numbers, #pay-loading, #pay-error
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------

  // Atalho seguro para document.querySelector (retorna null se não encontrar).
  function $(selector) {
    return document.querySelector(selector);
  }

  // Formata número para Real brasileiro: 1234.5 → "R$ 1.234,50".
  function formatBRL(valor) {
    var n = Number(valor);
    if (!isFinite(n) || n < 0) n = 0;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  // Preço de cada número (padrão R$ 10,00 se a config não existir).
  function precoPorNumero() {
    var preco = window.RIFA_CONFIG && window.RIFA_CONFIG.precoPorNumero;
    return Number(preco) > 0 ? Number(preco) : 10;
  }

  // Lista de números selecionados (array de strings/numbers).
  function getSelected() {
    if (window.Rifa && typeof window.Rifa.getSelected === 'function') {
      var lista = window.Rifa.getSelected();
      return Array.isArray(lista) ? lista.slice() : [];
    }
    return [];
  }

  // Normaliza entrada para array de strings.
  function normalizaNumeros(lista) {
    return lista.map(function (n) { return String(n).trim(); }).filter(Boolean);
  }

  // Toast simples: reaproveita window.toast/showToast se existirem,
  // senão cria um elemento temporário fixo no canto inferior.
  function mostrarToast(mensagem, tipo) {
    if (!mensagem) return;
    if (typeof window.toast === 'function') { window.toast(mensagem, tipo); return; }
    if (typeof window.showToast === 'function') { window.showToast(mensagem, tipo); return; }
    if (window.RifaToast && typeof window.RifaToast.show === 'function') {
      window.RifaToast.show(mensagem, tipo); return;
    }
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
        'background:#111;color:#fff;padding:12px 20px;border-radius:10px;z-index:9999;' +
        'font-size:15px;box-shadow:0 6px 24px rgba(0,0,0,.25);max-width:90vw;text-align:center;';
      document.body.appendChild(el);
    }
    el.textContent = mensagem;
    el.style.background = tipo === 'error' ? '#b42318' : '#111';
    el.style.opacity = '1';
    el.style.display = 'block';
    clearTimeout(el._timer);
    el._timer = setTimeout(function () {
      el.style.opacity = '0';
      setTimeout(function () { el.style.display = 'none'; }, 300);
    }, 3000);
  }

  // Mostra mensagem de erro no #pay-error (e esconde se vazia).
  function mostrarErro(mensagem) {
    var erro = $('#pay-error');
    if (!erro) return;
    if (!mensagem) {
      erro.textContent = '';
      erro.classList.add('hidden');
      erro.style.display = 'none';
      erro.removeAttribute('role');
      return;
    }
    erro.textContent = mensagem;
    erro.classList.remove('hidden');
    erro.style.display = 'block';
    erro.setAttribute('role', 'alert');
  }

  // Liga/desliga estado de carregamento do botão de pagamento.
  // #btn-pay-pix: desabilita + texto "Gerando Pix..."; #pay-loading: mostra/esconde.
  var btnPayOriginal = '';
  function setLoading(ativo) {
    var btn = $('#btn-pay-pix');
    var loading = $('#pay-loading');
    if (btn) {
      if (ativo) {
        btnPayOriginal = btn.textContent || 'Pagar com Pix';
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
        btn.textContent = 'Gerando Pix...';
      } else {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.textContent = btnPayOriginal || 'Pagar com Pix';
      }
    }
    if (loading) loading.style.display = ativo ? 'flex' : 'none';
  }

  // ---------------------------------------------------------------------------
  // Estado do modal
  // ---------------------------------------------------------------------------

  var ultimoFoco = null; // Elemento que estava focado antes de abrir (para devolver o foco).

  function modalEl() { return $('#checkout-modal'); }

  // Atualiza chips de números e total a partir da seleção atual.
  function atualizarResumo() {
    var numeros = normalizaNumeros(getSelected());
    var total = numeros.length * precoPorNumero();

    // Chips dos números selecionados (#checkout-numbers).
    var container = $('#checkout-numbers');
    if (container) {
      container.innerHTML = '';
      if (numeros.length === 0) {
        var vazio = document.createElement('span');
        vazio.className = 'checkout-numeros-vazio';
        vazio.textContent = 'Nenhum número selecionado';
        container.appendChild(vazio);
      } else {
        numeros.forEach(function (numero) {
          var chip = document.createElement('span');
          chip.className = 'chip';
          chip.textContent = numero;
          container.appendChild(chip);
        });
      }
    }

    // Total formatado (#checkout-total).
    var totalEl = $('#checkout-total');
    if (totalEl) totalEl.textContent = formatBRL(total);

    // Sem números → desabilita pagamento e avisa.
    var btn = $('#btn-pay-pix');
    var form = $('#checkout-form');
    var semNumeros = numeros.length === 0;
    if (btn) btn.disabled = semNumeros || btn.getAttribute('aria-busy') === 'true';
    if (form) form.setAttribute('aria-disabled', semNumeros ? 'true' : 'false');

    // Esconde resultado Pix antigo ao reabrir.
    esconderPix();

    return { numeros: numeros, total: total };
  }

  // Esconde o bloco de resultado Pix e limpa QR/código.
  function esconderPix() {
    var resultado = $('#pix-result');
    if (resultado) resultado.style.display = 'none';
    var code = $('#pix-code');
    if (code) code.value = '';
    var qr = $('#pix-qr');
    if (qr) {
      qr.removeAttribute('src');
      qr.style.display = 'none';
    }
  }

  // ---------------------------------------------------------------------------
  // Abrir / fechar modal
  // ---------------------------------------------------------------------------

  function abrirCheckout() {
    var modal = modalEl();
    if (!modal) return;

    ultimoFoco = document.activeElement;

    atualizarResumo();

    // Abre com suporte a <dialog> e com fallback para div.
    if (typeof modal.showModal === 'function' && modal.tagName === 'DIALOG') {
      if (!modal.open) modal.showModal();
    } else {
      modal.classList.add('aberto');
      modal.classList.add('open');
      modal.classList.remove('hidden');
      modal.removeAttribute('hidden');
      modal.style.display = 'flex';
    }
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Foco acessível: primeiro campo do formulário.
    var primeiro = $('#buyer-name') || $('#btn-close-checkout');
    if (primeiro) primeiro.focus({ preventScroll: true });
  }

  function fecharCheckout() {
    var modal = modalEl();
    if (!modal) return;

    // Fecha com suporte a <dialog> e com fallback para div.
    if (typeof modal.close === 'function' && modal.tagName === 'DIALOG' && modal.open) {
      modal.close();
    } else {
      modal.classList.remove('aberto');
      modal.classList.remove('open');
      modal.classList.add('hidden');
      modal.setAttribute('hidden', '');
      modal.style.display = 'none';
    }
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setLoading(false);
    mostrarErro('');

    // Devolve o foco a quem abriu o modal (acessibilidade).
    if (ultimoFoco && typeof ultimoFoco.focus === 'function') {
      ultimoFoco.focus({ preventScroll: true });
    }
  }

  // Expõe para outros módulos (ex: cart.js) sem acoplamento direto.
  window.RifaCheckout = { open: abrirCheckout, close: fecharCheckout, show: abrirCheckout, hide: fecharCheckout };

  // Compat: cart.js pode disparar um evento para abrir o checkout.
  document.addEventListener('rifa:open-checkout', abrirCheckout);
  document.addEventListener('checkout:open', abrirCheckout);

  // ---------------------------------------------------------------------------
  // Fallback WhatsApp (quando SigiloPay não está disponível)
  // ---------------------------------------------------------------------------

  function fallbackWhatsApp(resumo, buyer) {
    var mensagem =
      'Olá! Quero participar da Rifa Donna Gina Moda Plus.\n' +
      'Números: ' + resumo.numeros.join(', ') + '\n' +
      'Total: ' + formatBRL(resumo.total) + '\n' +
      'Nome: ' + buyer.nome + '\n' +
      'WhatsApp: ' + buyer.telefone;

    if (typeof window.openWhatsApp === 'function') {
      window.openWhatsApp(mensagem);
      return true;
    }
    var numero = window.RIFA_CONFIG && (window.RIFA_CONFIG.whatsapp || window.RIFA_CONFIG.telefoneWhatsApp);
    var digits = String(numero || '').replace(/\D/g, '');
    var url = 'https://wa.me/' + (digits || '') + '?text=' + encodeURIComponent(mensagem);
    window.open(url, '_blank', 'noopener');
    return true;
  }

  // ---------------------------------------------------------------------------
  // Exibir resultado Pix
  // ---------------------------------------------------------------------------

  function exibirPix(dados, resumo) {
    var resultado = $('#pix-result');
    var codeEl = $('#pix-code');
    var qrEl = $('#pix-qr');
    var btnCopiar = $('#btn-copy-pix');

    var pixCode = dados && (dados.pixCode || dados.pixCopiaECola || '');
    var qrCode = dados && dados.qrCode;
    var checkoutUrl = dados && (dados.checkoutUrl || dados.url);

    // Mostra o bloco de resultado.
    if (resultado) resultado.style.display = 'block';

    // Preenche o código Pix (input/textarea ou texto).
    if (codeEl) {
      if ('value' in codeEl) codeEl.value = pixCode;
      else codeEl.textContent = pixCode;
    }
    if (btnCopiar) btnCopiar.disabled = !pixCode;

    // QR Code: prioriza URL/data fornecida; senão gera via api.qrserver.com.
    if (qrEl) {
      qrEl.style.display = 'block';
      var src = '';
      if (typeof qrCode === 'string' && qrCode.trim() !== '') {
        src = qrCode; // já é URL http(s) ou data:image
      } else if (pixCode) {
        src = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(pixCode);
      }
      if (src) {
        qrEl.src = src;
        qrEl.alt = 'QR Code para pagamento Pix — Rifa Donna Gina, total ' + formatBRL(resumo.total);
      } else {
        qrEl.removeAttribute('src');
      }
    }

    var msgDemo = document.getElementById('pix-demo-msg');
    if (msgDemo) msgDemo.style.display = 'none';

    // Link/botão secundário para o checkout SigiloPay (se vier URL).
    var btnCheckout = document.getElementById('btn-open-sigilopay');
    if (checkoutUrl) {
      if (!btnCheckout) {
        btnCheckout = document.createElement('a');
        btnCheckout.id = 'btn-open-sigilopay';
        btnCheckout.className = 'btn btn-secundario';
        btnCheckout.target = '_blank';
        btnCheckout.rel = 'noopener';
        btnCheckout.textContent = 'Abrir checkout SigiloPay';
        dadooAppend(resultado, btnCheckout);
      }
      btnCheckout.href = checkoutUrl;
      btnCheckout.style.display = 'inline-block';
    } else if (btnCheckout) {
      btnCheckout.style.display = 'none';
    }

    mostrarToast('Pix gerado com sucesso! Copie o código para pagar.', 'success');
  }

  // Anexa filho ao resultado Pix se o container existir.
  function dadooAppend(pai, filho) {
    var alvo = pai || $('#pix-result');
    if (alvo && filho) alvo.appendChild(filho);
  }

  // ---------------------------------------------------------------------------
  // Copiar código Pix
  // ---------------------------------------------------------------------------

  async function copiarPix() {
    var codeEl = $('#pix-code');
    var texto = codeEl ? (codeEl.value || codeEl.textContent || '') : '';
    if (!texto) {
      mostrarToast('Nenhum código Pix para copiar.', 'error');
      mostrarErro('Nenhum código Pix disponível para copiar.');
      return;
    }
    try {
      // Caminho moderno (requer HTTPS/localhost).
      await navigator.clipboard.writeText(texto);
      mostrarToast('Código Pix copiado!', 'success');
    } catch (err) {
      // Fallback: seleciona e usa execCommand (contextos sem clipboard API).
      var campo = codeEl.tagName === 'INPUT' || codeEl.tagName === 'TEXTAREA' ? codeEl : null;
      if (campo) {
        campo.focus();
        campo.select();
        try { campo.setSelectionRange(0, campo.value.length); } catch (e) { /* noop */ }
      } else {
        var sel = window.getSelection();
        var range = document.createRange();
        range.selectNodeContents(codeEl);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      try {
        document.execCommand('copy');
        mostrarToast('Código Pix copiado!', 'success');
      } catch (e) {
        mostrarToast('Não foi possível copiar. Selecione o código manualmente.', 'error');
      } finally {
        if (window.getSelection) window.getSelection().removeAllRanges();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Validação do formulário
  // ---------------------------------------------------------------------------

  function validarFormulario() {
    var nome = ($('#buyer-name') || {}).value || '';
    var telefone = ($('#buyer-phone') || {}).value || '';
    var email = ($('#buyer-email') || {}).value || '';

    var documento = (($('#buyer-document') || {}).value || '').replace(/\D/g, '');
    nome = nome.trim();
    telefone = telefone.replace(/\D/g, '');
    email = email.trim();

    if (nome.length < 2) {
      mostrarErro('Informe seu nome (mínimo 2 letras).');
      mostrarToast('Informe seu nome (mínimo 2 letras).', 'error');
      $('#buyer-name') && $('#buyer-name').focus();
      return null;
    }
    if (telefone.length < 10) {
      mostrarErro('Informe um WhatsApp válido com DDD (só números, mínimo 10 dígitos).');
      mostrarToast('WhatsApp inválido: mínimo 10 dígitos.', 'error');
      $('#buyer-phone') && $('#buyer-phone').focus();
      return null;
    }
    if (!cpfValido(documento)) {
      mostrarErro('Informe um CPF válido. A SigiloPay exige o documento para gerar o Pix.');
      mostrarToast('CPF inválido.', 'error');
      $('#buyer-document') && $('#buyer-document').focus();
      return null;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      mostrarErro('Informe um e-mail válido ou deixe o campo vazio.');
      mostrarToast('E-mail inválido.', 'error');
      $('#buyer-email') && $('#buyer-email').focus();
      return null;
    }

    mostrarErro('');
    return { nome: nome, telefone: telefone, email: email, documento: documento };
  }

  function cpfValido(cpf) {
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
    var nums = cpf.split('').map(Number);
    var soma = 0;
    for (var i = 0; i < 9; i++) soma += nums[i] * (10 - i);
    var d1 = (soma * 10) % 11;
    if (d1 === 10) d1 = 0;
    if (d1 !== nums[9]) return false;
    soma = 0;
    for (var j = 0; j < 10; j++) soma += nums[j] * (11 - j);
    var d2 = (soma * 10) % 11;
    if (d2 === 10) d2 = 0;
    return d2 === nums[10];
  }

  // ---------------------------------------------------------------------------
  // Submit: gerar Pix via SigiloPay (ou fallback WhatsApp)
  // ---------------------------------------------------------------------------

  async function onSubmit(evento) {
    evento.preventDefault();

    var resumo = atualizarResumo();
    if (resumo.numeros.length === 0) {
      mostrarErro('Selecione ao menos um número para continuar.');
      mostrarToast('Selecione ao menos um número.', 'error');
      return;
    }

    var buyer = validarFormulario();
    if (!buyer) return;

    // Sem SigiloPay → fallback WhatsApp imediato.
    if (!window.SigiloPay || typeof window.SigiloPay.createPix !== 'function') {
      fallbackWhatsApp(resumo, buyer);
      mostrarToast('Pagamento via WhatsApp aberto.', 'success');
      return;
    }

    setLoading(true);
    try {
      var resposta = await window.SigiloPay.createPix({
        amount: resumo.total,
        buyer: buyer,
        description: 'Rifa Donna Gina - números ' + resumo.numeros.join(','),
      });

      if (!resposta || resposta.ok === false || (!resposta.pixCode && !resposta.checkoutUrl)) {
        var motivo = (resposta && (resposta.message || resposta.erro || resposta.error)) || 'Não foi possível gerar o Pix. Tente novamente.';
        mostrarErro(motivo);
        mostrarToast(motivo, 'error');
        return;
      }

      exibirPix(resposta, resumo);
    } catch (err) {
      var msg = 'Erro ao gerar o Pix. Verifique sua conexão e tente novamente.';
      mostrarErro(msg);
      mostrarToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  // Ao clicar no botão de pagamento, delega para o submit do formulário
  // (ou chama o handler direto caso o botão esteja fora do <form>).
  function onPagar(evento) {
    var form = $('#checkout-form');
    if (form) {
      // O submit do formulário já valida e processa; só garante o envio.
      if (typeof form.requestSubmit === 'function') {
        evento.preventDefault();
        form.requestSubmit();
      }
    }
    // Se não houver formulário, o handler de submit cuida via evento submit
    // (bind abaixo). Nenhum outro comportamento aqui.
  }

  // ---------------------------------------------------------------------------
  // Eventos
  // ---------------------------------------------------------------------------

  function init() {
    var modal = modalEl();
    var form = $('#checkout-form');

    // Fechar: botão X, clique no overlay (fora do conteúdo) e ESC.
    var btnFechar = $('#btn-close-checkout');
    if (btnFechar) btnFechar.addEventListener('click', fecharCheckout);

    if (modal) {
      // Clique fora do conteúdo fecha (overlay). Só para div; <dialog> já
      // trata o backdrop via clique no próprio elemento modal.
      modal.addEventListener('click', function (evento) {
        if (evento.target === modal) fecharCheckout();
      });
      // Fallback ESC para divs (dialog nativo já fecha sozinho).
      document.addEventListener('keydown', function (evento) {
        if (evento.key === 'Escape' || evento.key === 'Esc') {
          var aberto = modal.classList.contains('aberto') || modal.classList.contains('open') ||
            (modal.tagName === 'DIALOG' && modal.open);
          if (aberto) fecharCheckout();
        }
      });
    }

    // Atualiza resumo sempre que a seleção mudar (mesmo com modal fechado,
    // para o próximo open já refletir os números).
    document.addEventListener('rifa:change', atualizarResumo);

    // Submit do formulário e botão de pagamento.
    if (form) form.addEventListener('submit', onSubmit);
    var btnPagar = $('#btn-pay-pix');
    if (btnPagar) btnPagar.addEventListener('click', onPagar);

    // Copiar código Pix.
    var btnCopiar = $('#btn-copy-pix');
    if (btnCopiar) btnCopiar.addEventListener('click', copiarPix);

    // Estado inicial.
    esconderPix();
    setLoading(false);
  }

  // Inicializa quando o DOM estiver pronto.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
