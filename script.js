/* Ultragaz Entregas Flash — pedido pelo WhatsApp
   JavaScript puro, sem dependências, sem backend e sem armazenar dados. */
(() => {
  'use strict';

  const WHATSAPP = '5513976033642';
  const PRICE = { regular: 110, pg: 120 };
  const MAX_QTY = 99;    // limite técnico do seletor

  const $ = (id) => document.getElementById(id);
  const form = $('order-form');
  if (!form) return;

  const f = {
    cep: $('cep'), cepMsg: $('cep-msg'), retry: $('cep-retry'), block: $('address-block'),
    street: $('street'), district: $('district'), city: $('city'), uf: $('uf'),
    number: $('number'), complement: $('complement'), name: $('name'),
  };
  const ui = {
    qty: $('qty'), minus: $('qty-minus'), plus: $('qty-plus'), hint: $('qty-hint'),
    sName: $('s-name'), sAddress: $('s-address'), sOrder: $('s-order'), sTotal: $('s-total'),
    sNote: $('s-note'), badge: $('summary-badge'), barTotal: $('bar-total'), formError: $('form-error'),
  };
  const state = { qty: 1, area: null, cep: '' }; // area: 'regular' | 'pg' | 'other' | null
  let controller = null;

  /* ---------- Utilidades ---------- */
  const digits = (s) => s.replace(/\D/g, '');
  const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const money = (n) => n.toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).replace(/\u00a0/g, ' ');
  const qtyLabel = (n) => (n === 1 ? '1 gás' : n + ' gases');
  const cepFormatted = () => { const d = digits(f.cep.value); return d.slice(0, 5) + '-' + d.slice(5); };

  function setText(node, text) {
    if (node.textContent === text) return;
    node.textContent = text;
    node.classList.remove('bump');
    void node.offsetWidth; // reinicia a animação sutil
    node.classList.add('bump');
  }

  /* ---------- Regras comerciais ---------- */
  function areaOf(city, uf) {
    if (uf !== 'SP') return 'other';
    const c = norm(city);
    if (c === 'sao vicente' || c === 'santos') return 'regular';
    if (c === 'praia grande') return 'pg';
    return 'other';
  }

  // Retorna null (sem CEP) ou { unit, total }
  function quote() {
    if (state.area === 'regular') return { unit: PRICE.regular, total: PRICE.regular * state.qty };
    if (state.area === 'pg') return { unit: PRICE.pg, total: PRICE.pg * state.qty };
    return null;
  }

  /* ---------- Mensagens e erros ---------- */
  function setCepMsg(text, kind) {
    f.cepMsg.textContent = text || '';
    f.cepMsg.className = 'field-msg' + (kind ? ' is-' + kind : '');
    f.cep.setAttribute('aria-invalid', kind === 'error' ? 'true' : 'false');
  }

  function setErr(input, msg) {
    if (input === f.cep) { setCepMsg(msg, msg ? 'error' : ''); return; }
    const node = $(input.id + '-error');
    if (node) { node.textContent = msg || ''; node.className = 'field-msg' + (msg ? ' is-error' : ''); }
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  /* ---------- Resumo ---------- */
  function addressText() {
    if (!state.area || state.area === 'other') return '—';
    const num = f.number.value.trim();
    const comp = f.complement.value.trim();
    return [
      f.street.value.trim() + (num ? ', ' + num : ''),
      comp,
      f.district.value.trim(),
      f.city.value + ' - ' + f.uf.value,
      'CEP ' + cepFormatted(),
    ].filter(Boolean).join('\n');
  }

  function isReady() {
    return (state.area === 'regular' || state.area === 'pg') &&
      f.street.value.trim() && f.district.value.trim() &&
      f.number.value.trim() && f.name.value.trim().length >= 2;
  }

  function render() {
    const q = quote();
    ui.qty.textContent = state.qty;
    ui.minus.disabled = state.qty <= 1;
    ui.plus.disabled = state.qty >= MAX_QTY;

    let total = 'Informe o CEP';
    let note = '';
    let hint = 'Informe o CEP para ver o valor. São Vicente e Santos: R$ 110 · Praia Grande: R$ 120, com entrega.';

    if (q) {
      total = money(q.total);
      note = state.qty + ' × ' + money(q.unit);
      hint = (state.area === 'pg' ? 'Praia Grande: R$ 120' : 'R$ 110') + ' por gás, com entrega.';
    }

    setText(ui.sName, f.name.value.trim() || '—');
    setText(ui.sAddress, addressText());
    setText(ui.sOrder, qtyLabel(state.qty));
    setText(ui.sTotal, total);
    setText(ui.barTotal, total);
    ui.sNote.textContent = note;
    ui.sNote.hidden = !note;
    ui.hint.textContent = hint;
    ui.badge.hidden = !isReady();
  }

  /* ---------- ViaCEP ---------- */
  function clearAddress() {
    state.area = null;
    state.cep = '';
    f.block.hidden = true;
    [f.street, f.district, f.city, f.uf].forEach((i) => { i.value = ''; setErr(i, ''); });
  }

  async function lookup(d) {
    if (d === state.cep) return; // já resolvido: evita requisição repetida
    if (controller) controller.abort();
    controller = new AbortController();
    setCepMsg('Buscando endereço…', 'info');
    try {
      const res = await fetch('https://viacep.com.br/ws/' + d + '/json/', { signal: controller.signal });
      if (res.status === 400) { clearAddress(); setCepMsg('Digite um CEP válido.', 'error'); return; }
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json();
      if (data.erro) {
        clearAddress();
        setCepMsg('Não encontramos esse CEP. Confira os números e tente novamente.', 'error');
        return;
      }
      state.cep = d;
      f.street.value = data.logradouro || '';
      f.district.value = data.bairro || '';
      f.city.value = data.localidade || '';
      f.uf.value = data.uf || '';
      state.area = areaOf(f.city.value, f.uf.value);
      if (state.area === 'other') {
        f.block.hidden = true;
        setCepMsg('No momento atendemos São Vicente, Santos e Praia Grande.', 'error');
        return;
      }
      setCepMsg('CEP encontrado.', 'ok');
      f.block.hidden = false;
      f.block.classList.remove('reveal');
      void f.block.offsetWidth;
      f.block.classList.add('reveal');
      if (document.activeElement === f.cep) (f.street.value ? f.number : f.street).focus();
    } catch (err) {
      if (err.name === 'AbortError') return;
      clearAddress();
      setCepMsg('Não foi possível consultar o CEP agora. Verifique sua conexão e tente novamente.', 'error');
      f.retry.hidden = false;
    } finally {
      render();
    }
  }

  f.cep.addEventListener('input', () => {
    const d = digits(f.cep.value).slice(0, 8);
    f.cep.value = d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d;
    f.retry.hidden = true;
    if (d.length < 8) {
      if (controller) controller.abort();
      clearAddress();
      setCepMsg('');
      render();
    } else {
      lookup(d);
    }
  });

  f.retry.addEventListener('click', () => {
    f.retry.hidden = true;
    const d = digits(f.cep.value);
    if (d.length === 8) lookup(d);
  });

  /* ---------- Campos e quantidade ---------- */
  [f.street, f.district, f.number, f.complement, f.name].forEach((input) => {
    input.addEventListener('input', () => { setErr(input, ''); ui.formError.hidden = true; render(); });
  });

  function changeQty(delta) {
    state.qty = Math.min(MAX_QTY, Math.max(1, state.qty + delta));
    render();
  }
  ui.minus.addEventListener('click', () => changeQty(-1));
  ui.plus.addEventListener('click', () => changeQty(1));

  /* ---------- Validação e envio ---------- */
  function validate() {
    let first = null;
    const bad = (input, msg) => { setErr(input, msg); if (!first) first = input; };

    if (digits(f.cep.value).length !== 8) bad(f.cep, 'Digite um CEP válido.');
    else if (!state.area) bad(f.cep, 'Aguarde a consulta do CEP ou tente novamente.');
    else if (state.area === 'other') bad(f.cep, 'No momento atendemos São Vicente, Santos e Praia Grande.');

    if (state.area === 'regular' || state.area === 'pg') {
      if (!f.street.value.trim()) bad(f.street, 'Informe a rua.');
      if (!f.district.value.trim()) bad(f.district, 'Informe o bairro.');
      if (!f.number.value.trim()) bad(f.number, 'Informe o número da residência.');
    }
    if (f.name.value.trim().length < 2) bad(f.name, 'Informe seu nome.');
    return first;
  }

  function buildMessage() {
    const q = quote();
    const total = money(q.total);
    const comp = f.complement.value.trim();
    return [
      'Olá! Quero fazer um pedido de gás.',
      '',
      'Nome: ' + f.name.value.trim(),
      '',
      'Pedido: ' + qtyLabel(state.qty),
      '',
      'Endereço:',
      f.street.value.trim() + ', ' + f.number.value.trim(),
      ...(comp ? [comp] : []),
      f.district.value.trim(),
      f.city.value + ' - ' + f.uf.value,
      'CEP: ' + cepFormatted(),
      '',
      'Total: ' + total,
      '',
      'Quero confirmar meu pedido.',
    ].join('\n');
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const invalid = validate();
    if (invalid) {
      ui.formError.textContent = 'Confira os campos destacados para continuar.';
      ui.formError.hidden = false;
      invalid.focus();
      return;
    }
    ui.formError.hidden = true;
    const url = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(buildMessage());
    const win = window.open(url, '_blank');
    if (win) win.opener = null; else window.location.href = url;
  });

  /* ---------- Esconde o WhatsApp flutuante enquanto o formulário está na tela ---------- */
  const section = $('pedido');
  if (section && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      document.body.classList.toggle('in-order', entry.isIntersecting);
    }, { threshold: 0.05 }).observe(section);
  }

  render();
})();

/* Carrossel de fotos dos produtos — rolagem nativa com scroll-snap (swipe no celular)
   + setas, pontos e teclado. Independente do sistema de pedido de gás. */
(() => {
  'use strict';
  document.querySelectorAll('[data-carousel]').forEach((root) => {
    const track = root.querySelector('.carousel-track');
    const count = root.querySelectorAll('.carousel-slide').length;
    const dots = root.querySelectorAll('.carousel-dot');
    const prev = root.querySelector('.carousel-prev');
    const next = root.querySelector('.carousel-next');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let index = 0;
    let ticking = false;

    const go = (i) => {
      const n = Math.max(0, Math.min(count - 1, i));
      track.scrollTo({ left: n * track.clientWidth, behavior: reduce.matches ? 'auto' : 'smooth' });
    };
    const update = () => {
      index = Math.round(track.scrollLeft / track.clientWidth) || 0;
      dots.forEach((d, i) => d.setAttribute('aria-current', i === index ? 'true' : 'false'));
      prev.disabled = index <= 0;
      next.disabled = index >= count - 1;
    };

    track.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; update(); });
    }, { passive: true });
    prev.addEventListener('click', () => go(index - 1));
    next.addEventListener('click', () => go(index + 1));
    dots.forEach((d, i) => d.addEventListener('click', () => go(i)));
    track.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); }
    });
    window.addEventListener('resize', () => track.scrollTo({ left: index * track.clientWidth, behavior: 'auto' }));
    update();
  });
})();
