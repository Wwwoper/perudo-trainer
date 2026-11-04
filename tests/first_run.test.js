import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  FIRST_RUN_TITLE, FIRST_RUN_STEPS, FIRST_RUN_LEAD, FIRST_RUN_HIDE, shouldShowFirstRun,
} from '../src/first_run.js';
import { FIRST_GAME_LABEL } from '../src/game_settings.js';
import { TABS } from '../src/ui/tabs.js';

const root = new URL('../', import.meta.url);
const BANNED = /обманщик|врёт|блефует/i;

describe('карточка «Впервые здесь?»', () => {
  it('три шага в порядке: правила → первая партия → Тренажёр', () => {
    assert.deepEqual(FIRST_RUN_STEPS.map((s) => s.id), ['rules', 'game', 'train']);
    assert.match(FIRST_RUN_STEPS[0].title, /Правила/);
    assert.equal(FIRST_RUN_STEPS[1].title, FIRST_GAME_LABEL);
    assert.equal(FIRST_RUN_STEPS[2].title, 'Тренажёр');
  });
  it('ссылки ведут на существующие страницы, а разделы — на существующие вкладки', () => {
    for (const s of FIRST_RUN_STEPS) {
      if (s.kind === 'link') assert.ok(existsSync(new URL(s.href, root)), s.href);
      else assert.ok(TABS.includes(s.tab), s.tab);
    }
  });
  it('показывается только на чистом профиле и пока не скрыта', () => {
    assert.equal(shouldShowFirstRun({ empty: true, hidden: false }), true);
    assert.equal(shouldShowFirstRun({ empty: true }), true);
    assert.equal(shouldShowFirstRun({ empty: false, hidden: false }), false);
    assert.equal(shouldShowFirstRun({ empty: true, hidden: true }), false);
    assert.equal(shouldShowFirstRun(), false);
    assert.equal(shouldShowFirstRun({ empty: 'да' }), false);
  });
  it('в index.html есть контейнер карточки внутри Калькулятора', () => {
    const html = readFileSync(new URL('index.html', root), 'utf8');
    const calc = html.slice(html.indexOf('<section id="calc"'), html.indexOf('<section id="train"'));
    assert.match(calc, /<section id="firstRun" class="card first-run" aria-labelledby="firstRunTitle" hidden><\/section>/);
  });
  it('тексты короткие и без запрещённых слов', () => {
    const all = [FIRST_RUN_TITLE, FIRST_RUN_LEAD, FIRST_RUN_HIDE, ...FIRST_RUN_STEPS.flatMap((s) => [s.title, s.text, s.action])];
    for (const t of all) {
      assert.doesNotMatch(t, BANNED);
      assert.ok(t.length <= 120, t);
    }
  });
  it('руководство упоминает карточку', () => {
    const t = readFileSync(new URL('docs/guide/quick-start.html', root), 'utf8').replace(/<[^>]+>/g, ' ');
    assert.ok(t.includes(`«${FIRST_RUN_TITLE}»`));
  });
});
