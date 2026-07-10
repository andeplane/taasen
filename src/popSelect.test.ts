import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installPopoverDismiss, popSelect, type PopSelect } from './popSelect';

const VALUES = ['Alpha', 'Beta', 'Gamma'];

function mount(hueFor?: (v: string) => string): { ps: PopSelect; onChange: ReturnType<typeof vi.fn<() => void>> } {
  document.body.innerHTML = '<span class="pop-wrap" id="ms"></span><div id="outside"></div>';
  const onChange = vi.fn<() => void>();
  const ps = popSelect('ms', 'Ting', VALUES, onChange, hueFor);
  return { ps, onChange };
}

const pill = () => document.querySelector('#ms .pill')!.textContent;
const pop = () => document.querySelector('#ms .pop')!;
const opt = (v: string) => document.querySelector<HTMLElement>(`#ms label.opt[data-v="${v}"]`)!;

describe('popSelect', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders all values checked with pill "alle"', () => {
    const { ps } = mount();
    expect(document.querySelectorAll('#ms label.opt.checked').length).toBe(3);
    expect(pill()).toBe('alle');
    expect(ps.isAll()).toBe(true);
    expect(ps.count()).toBe(3);
  });

  it('renders hue dots when hueFor is provided', () => {
    mount(v => (v === 'Alpha' ? '#111111' : '#222222'));
    const hue = opt('Alpha').querySelector<HTMLElement>('.hue')!;
    expect(hue.style.background).toBe('rgb(17, 17, 17)');
  });

  it('omits hue dots without hueFor', () => {
    mount();
    expect(opt('Alpha').querySelector('.hue')).toBeNull();
  });

  it('toggles the popover open and closed from the button', () => {
    mount();
    const btn = document.querySelector<HTMLElement>('#ms .tbtn')!;
    btn.click();
    expect(pop().classList.contains('open')).toBe(true);
    btn.click();
    expect(pop().classList.contains('open')).toBe(false);
  });

  it('closes other open popovers when opening', () => {
    document.body.innerHTML = '<span class="pop-wrap" id="ms"></span><span class="pop-wrap" id="ms2"></span>';
    const onChange = vi.fn<() => void>();
    popSelect('ms', 'A', VALUES, onChange);
    popSelect('ms2', 'B', VALUES, onChange);
    document.querySelector<HTMLElement>('#ms .tbtn')!.click();
    document.querySelector<HTMLElement>('#ms2 .tbtn')!.click();
    expect(document.querySelector('#ms .pop')!.classList.contains('open')).toBe(false);
    expect(document.querySelector('#ms2 .pop')!.classList.contains('open')).toBe(true);
  });

  it('unchecks and rechecks a value, reporting state', () => {
    const { ps, onChange } = mount();
    opt('Beta').click();
    expect(ps.pass('Beta')).toBe(false);
    expect(ps.pass('Alpha')).toBe(true);
    expect(ps.isAll()).toBe(false);
    expect(ps.count()).toBe(2);
    expect(pill()).toBe('2/3');
    expect(onChange).toHaveBeenCalledTimes(1);
    opt('Beta').click();
    expect(ps.pass('Beta')).toBe(true);
    expect(pill()).toBe('alle');
  });

  it('passes everything when all values are selected', () => {
    const { ps } = mount();
    expect(ps.pass('NotAValue')).toBe(true); // no constraint when all selected
  });

  it('fjern alle deselects everything, velg alle restores', () => {
    const { ps, onChange } = mount();
    document.querySelector<HTMLElement>('#ms .none')!.click();
    expect(ps.count()).toBe(0);
    expect(pill()).toBe('0/3');
    expect(document.querySelectorAll('#ms label.opt.checked').length).toBe(0);
    document.querySelector<HTMLElement>('#ms .all')!.click();
    expect(ps.isAll()).toBe(true);
    expect(document.querySelectorAll('#ms label.opt.checked').length).toBe(3);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('reset restores all values without firing onChange', () => {
    const { ps, onChange } = mount();
    opt('Alpha').click();
    onChange.mockClear();
    ps.reset();
    expect(ps.isAll()).toBe(true);
    expect(pill()).toBe('alle');
    expect(document.querySelectorAll('#ms label.opt.checked').length).toBe(3);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('installPopoverDismiss', () => {
  it('closes open popovers when clicking outside, keeps them when clicking inside', () => {
    mount();
    installPopoverDismiss();
    document.querySelector<HTMLElement>('#ms .tbtn')!.click();
    expect(pop().classList.contains('open')).toBe(true);
    // click inside the wrapper: stays open
    opt('Alpha').click();
    expect(pop().classList.contains('open')).toBe(true);
    // click outside: closes
    document.querySelector<HTMLElement>('#outside')!.click();
    expect(pop().classList.contains('open')).toBe(false);
  });
});
