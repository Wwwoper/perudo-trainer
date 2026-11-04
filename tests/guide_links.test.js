import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { TAB_GUIDE, TAB_TITLES, GUIDE_ROOT, guideHref, guideLabel } from '../src/guide_links.js';
import { TABS } from '../src/ui/tabs.js';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');

/** Кусок index.html от <section id="tab"> до следующей секции раздела. */
function sectionHtml(tab) {
  const i = html.indexOf(`<section id="${tab}"`);
  assert.ok(i >= 0, `нет раздела ${tab}`);
  const j = html.indexOf('<!-- =================', i);
  return html.slice(i, j < 0 ? undefined : j);
}

describe('ссылки на руководство из разделов', () => {
  it('у каждого раздела приложения есть страница руководства и название', () => {
    for (const t of TABS) {
      assert.ok(TAB_GUIDE[t], `нет страницы для ${t}`);
      assert.ok(TAB_TITLES[t], `нет названия для ${t}`);
    }
    assert.deepEqual(Object.keys(TAB_GUIDE).sort(), [...TABS].sort());
  });
  it('каждая страница из карты существует', () => {
    for (const [t, page] of Object.entries(TAB_GUIDE)) {
      assert.ok(existsSync(new URL(`${GUIDE_ROOT}${page}`, root)), `${t}: нет ${page}`);
    }
  });
  it('в шапке каждого учебного раздела есть «?» с правильной ссылкой и подписью', () => {
    // В партии места в HUD на телефоне нет: её ссылка лежит в меню ☰ (отдельный тест ниже)
    for (const t of TABS.filter((x) => x !== 'game')) {
      const sec = sectionHtml(t);
      const m = sec.match(/<a class="help-link" href="([^"]+)" target="_blank" rel="noopener" aria-label="([^"]+)">\?<\/a>/);
      assert.ok(m, `в разделе ${t} нет ссылки «?»`);
      assert.equal(m[1], guideHref(t));
      assert.equal(m[2], guideLabel(t));
    }
  });
  it('ссылка в шапке приложения по умолчанию ведёт на страницу первого раздела', () => {
    const m = html.match(/<a id="helpLink" class="help-link help-link-header" href="([^"]+)"[^>]*aria-label="([^"]+)">/);
    assert.ok(m);
    assert.equal(m[1], guideHref('calc'));
    assert.equal(m[2], guideLabel('calc'));
  });
  it('в меню разделов есть ссылка «Справка по разделу», по умолчанию на страницу первого раздела', () => {
    const nav = html.slice(html.indexOf('<nav id="mainNav"'), html.indexOf('</nav>'));
    const m = nav.match(/<a id="helpLinkMenu" class="help-link help-link-menu" href="([^"]+)" target="_blank" rel="noopener">([^<]+)<\/a>/);
    assert.ok(m);
    assert.equal(m[1], guideHref('calc'));
    assert.equal(m[2], 'Справка по разделу');
    assert.ok(!html.slice(html.indexOf('<section id="game"'), html.indexOf('<section id="duel"')).includes('class="help-link"'),
      'в HUD партии «?» не нужен: там нет места');
  });
  it('неизвестный раздел ведёт в оглавление руководства', () => {
    assert.equal(guideHref('nope'), GUIDE_ROOT);
    assert.equal(guideHref('toString'), GUIDE_ROOT);
    assert.equal(guideLabel('nope'), 'Руководство');
  });
});
