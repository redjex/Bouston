(function () {
  'use strict';

  const PHRASES = [
    { q: 'Зачем мне регистрироваться?',      a: 'Чтобы потом забыть пароль и снова зарегистрироваться.' },
    { q: 'Что я здесь найду?',                a: 'Ничего полезного. Но ты всё равно останешься.' },
    { q: 'Это вообще безопасно?',             a: 'Безопаснее, чем читать ленту в 3 ночи.' },
    { q: 'Почему я должен вам доверять?',     a: 'У нас красивые кнопки. Этого достаточно.' },
    { q: 'Сколько времени я тут потрачу?',    a: 'Немного. Шутка. Очень много.' },
    { q: 'Есть тут что-то полезное?',         a: 'Зависит от того, что ты считаешь полезным.' },
    { q: 'Почему я вообще здесь?',            a: 'Хороший вопрос. Мы тоже не знаем.' },
    { q: 'Что будет после регистрации?',      a: 'Счастье. Или просто главное меню.' },
    { q: 'Можно не регистрироваться?',        a: 'Можно. Но ты же уже здесь.' },
    { q: 'Это точно не очередной стартап?',   a: 'Это точно очередной стартап. Но красивый.' },
  ];

  let index = 0;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /* Стриминг: перенос по словам, blur по буквам */
  function streamText(el, text, charDelay) {
    charDelay = charDelay || 42;
    return new Promise(function (resolve) {
      el.innerHTML = '';

      // Разбиваем на слова и разделители, сохраняем порядок
      var parts = [];
      var wordRe = /[^ \n]+|[ \n]/g;
      var m;
      while ((m = wordRe.exec(text)) !== null) {
        parts.push(m[0]);
      }

      // Строим очередь событий: {type, payload}
      var queue = [];
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p === '\n') {
          queue.push({ type: 'br' });
        } else if (p === ' ') {
          queue.push({ type: 'space' });
        } else {
          // Каждую букву слова — отдельный элемент, но все буквы одного слова идут подряд
          queue.push({ type: 'word-start', word: p });
          for (var c = 0; c < p.length; c++) {
            queue.push({ type: 'char', ch: p[c] });
          }
        }
      }

      var qi = 0;
      var currentWordEl = null;

      function next() {
        if (qi >= queue.length) { resolve(); return; }
        var item = queue[qi++];

        if (item.type === 'br') {
          el.appendChild(document.createElement('br'));
          currentWordEl = null;
          next(); return;
        }

        if (item.type === 'space') {
          // Пробел как текстовый узел между словами
          el.appendChild(document.createTextNode(' '));
          currentWordEl = null;
          next(); return;
        }

        if (item.type === 'word-start') {
          // Создаём контейнер слова прямо сейчас и вставляем в DOM
          currentWordEl = document.createElement('span');
          currentWordEl.className = 'sc-word';
          el.appendChild(currentWordEl);
          next(); return;
        }

        if (item.type === 'char') {
          var span = document.createElement('span');
          span.className = 'sc';
          span.textContent = item.ch;
          currentWordEl.appendChild(span);
          setTimeout(next, charDelay);
          return;
        }

        next();
      }

      next();
    });
  }

  function fade(el, to, ms) {
    ms = ms || 350;
    return new Promise(function (resolve) {
      el.style.transition = 'opacity ' + ms + 'ms ease';
      el.style.opacity = to;
      setTimeout(resolve, ms);
    });
  }

  async function runPhrase(qEl, aEl) {
    var phrase = PHRASES[index % PHRASES.length];
    index++;

    qEl.style.opacity = '0';
    aEl.style.opacity = '0';
    qEl.querySelector('.sc-text').innerHTML = '';
    aEl.querySelector('.sc-text').innerHTML = '';

    await wait(200);

    await fade(qEl, '1');
    await streamText(qEl.querySelector('.sc-text'), phrase.q, 40);

    await wait(500);

    await fade(aEl, '1');
    await streamText(aEl.querySelector('.sc-text'), phrase.a, 32);

    await wait(2800);

    await Promise.all([fade(qEl, '0'), fade(aEl, '0')]);
    await wait(300);
  }

  async function loop(banner) {
    var qEl = banner.querySelector('.sc-q');
    var aEl = banner.querySelector('.sc-a');
    if (!qEl || !aEl) return;
    while (true) {
      await runPhrase(qEl, aEl);
    }
  }

  document.querySelectorAll('.banner__chat').forEach(loop);
})();
