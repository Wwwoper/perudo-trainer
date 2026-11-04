import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REPEAT_GOAL, repeatProgress, repeatChipText, repeatReason, repeatAfterText } from '../src/repeat_text.js';

const root = new URL('../', import.meta.url);
const BANNED = /обманщик|врёт|блефует/i;

describe('повторы в Тренажёре: причина и прогресс', () => {
  it('нужно два успешных повтора подряд', () => assert.equal(REPEAT_GOAL, 2));
  it('прогресс: «N из 2 успешных повторов»', () => {
    assert.equal(repeatProgress({ streak: 0 }), '0 из 2 успешных повторов');
    assert.equal(repeatProgress({ streak: 1 }), '1 из 2 успешных повторов');
    assert.equal(repeatProgress({ streak: 2 }), '2 из 2 успешных повторов');
  });
  it('мусор и перебор не ломают текст', () => {
    for (const it2 of [undefined, null, {}, { streak: -3 }, { streak: 'да' }, { streak: 1.5 }]) {
      assert.equal(repeatProgress(it2), '0 из 2 успешных повторов');
    }
    assert.equal(repeatProgress({ streak: 10 }), '2 из 2 успешных повторов');
  });
  it('значок содержит слово «повтор» и прогресс', () => {
    assert.equal(repeatChipText({ streak: 1 }), '🔁 повтор · 1 из 2 успешных повторов');
  });
  it('причина объясняет, почему ситуация вернулась и когда уйдёт', () => {
    const t = repeatReason();
    assert.match(t, /раньше решение в ней было неудачным/);
    assert.match(t, /после 2 успешных повторов подряд/);
    assert.doesNotMatch(t, BANNED);
  });
  it('итог после ответа: успех, освоено, ошибка', () => {
    assert.equal(repeatAfterText({ streak: 1 }, true), 'Успешный повтор: 1 из 2 успешных повторов. Ещё 1, и ситуация уйдёт из очереди.');
    assert.equal(repeatAfterText({ streak: 2 }, true), 'Ситуация освоена и убрана из очереди повторов.');
    assert.equal(repeatAfterText({ streak: 0 }, false), 'Счёт повторов сброшен: 0 из 2. Ситуация останется в очереди.');
  });
  it('index.html держит место для пояснения, а руководство описывает прогресс', () => {
    const html = readFileSync(new URL('index.html', root), 'utf8');
    assert.match(html, /<p id="tRepeatNote" class="muted trainer-repeat-note" hidden><\/p>/);
    const g = readFileSync(new URL('docs/guide/trainer.html', root), 'utf8').replace(/<[^>]+>/g, ' ');
    assert.match(g, /1 из 2 успешных повторов/);
  });
});
