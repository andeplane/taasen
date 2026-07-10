import { escapeHtml } from './format';

export interface PopSelect {
  pass(value: string): boolean;
  isAll(): boolean;
  count(): number;
  reset(): void;
}

/**
 * Popover multi-select with "velg alle / fjern alle".
 * All values selected means no constraint; the button pill shows "alle" or "n/total".
 */
export function popSelect(
  elId: string,
  label: string,
  values: string[],
  onChange: () => void,
  hueFor?: (v: string) => string,
): PopSelect {
  const el = document.getElementById(elId)!;
  const state = new Set(values);
  el.innerHTML = `<button class="tbtn"><span>${escapeHtml(label)}</span><span class="pill">alle</span><span class="caret">▾</span></button>
    <div class="pop">
      <div class="acts"><button class="all">velg alle</button><button class="none">fjern alle</button></div>
      ${values.map(v => `<label class="opt checked" data-v="${escapeHtml(v)}">
        <span class="box">✓</span>${hueFor ? `<span class="hue" style="background:${hueFor(v)}"></span>` : ''}
        <span style="flex:1">${escapeHtml(v)}</span></label>`).join('')}
    </div>`;
  const btn = el.querySelector<HTMLButtonElement>('.tbtn')!;
  const pop = el.querySelector<HTMLElement>('.pop')!;
  const pill = el.querySelector<HTMLElement>('.pill')!;
  const update = () => {
    pill.textContent = state.size === values.length ? 'alle' : `${state.size}/${values.length}`;
    onChange();
  };
  btn.onclick = () => {
    document.querySelectorAll('.pop.open').forEach(p => { if (p !== pop) p.classList.remove('open'); });
    pop.classList.toggle('open');
  };
  pop.querySelectorAll<HTMLElement>('label.opt').forEach(o => o.onclick = () => {
    const v = o.dataset.v!;
    if (state.has(v)) state.delete(v);
    else state.add(v);
    o.classList.toggle('checked', state.has(v));
    update();
  });
  pop.querySelector<HTMLButtonElement>('.all')!.onclick = () => {
    values.forEach(v => state.add(v));
    pop.querySelectorAll('label.opt').forEach(o => o.classList.add('checked'));
    update();
  };
  pop.querySelector<HTMLButtonElement>('.none')!.onclick = () => {
    state.clear();
    pop.querySelectorAll('label.opt').forEach(o => o.classList.remove('checked'));
    update();
  };
  return {
    pass: v => state.size === values.length || state.has(v),
    isAll: () => state.size === values.length,
    count: () => state.size,
    reset: () => {
      values.forEach(v => state.add(v));
      pop.querySelectorAll('label.opt').forEach(o => o.classList.add('checked'));
      pill.textContent = 'alle';
    },
  };
}

/** Close every open popover when clicking outside any popover wrapper. */
export function installPopoverDismiss(): void {
  document.addEventListener('click', e => {
    if (!(e.target as HTMLElement).closest('.pop-wrap'))
      document.querySelectorAll('.pop.open').forEach(p => p.classList.remove('open'));
  });
}
