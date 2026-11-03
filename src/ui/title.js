// src/ui/title.js — title screen.
export function showTitle(root, { hasSave, onNew, onContinue, onLoad, onImport }) {
  root.innerHTML = `
    <section class="title-screen">
      <h1 class="title">
        <span class="title-main">Eldermere</span>
        <span class="title-sub">Chronicles</span>
      </h1>
      <p class="tagline">Dungeons form wherever magic runs wild. Someone has to seal them.</p>
      <nav class="title-menu" aria-label="Main menu">
        <button class="menu-item" data-act="continue" ${hasSave ? '' : 'hidden'}>Continue</button>
        <button class="menu-item" data-act="new">New game</button>
        <button class="menu-item" data-act="load" ${hasSave ? '' : 'hidden'}>Load game</button>
        <button class="menu-item" data-act="import">Import save</button>
        <button class="menu-item" data-act="dungeons" onclick="location.href='dungeon-editor.html'">Dungeon creator</button>
        <input type="file" accept=".json,application/json" hidden>
      </nav>
      <p class="error title-error" hidden></p>
      <p class="build-note">Prototype build</p>
    </section>`;
  const $ = s => root.querySelector(s);
  $('[data-act=new]').addEventListener('click', onNew);
  $('[data-act=continue]').addEventListener('click', onContinue);
  $('[data-act=load]').addEventListener('click', onLoad);
  const file = $('input[type=file]'), err = $('.title-error');
  $('[data-act=import]').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    try { await onImport(file.files[0]); }
    catch (e) { err.textContent = e.message; err.hidden = false; }
    file.value = '';
  });
  $(hasSave ? '[data-act=continue]' : '[data-act=new]').focus({ preventScroll: true });
}

// The load screen: every save slot, newest first.
export function showLoad(root, { saves, onLoad, onEdit, onExport, onDelete, onBack }) {
  const when = t => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  root.innerHTML = `
    <section class="load-screen">
      <h2>Load game</h2>
      ${saves.length ? `<ul class="save-list">${saves.map(s => `
        <li data-id="${s.id}">
          <div class="save-info">
            <b>${escape(s.name)}</b>
            <span class="muted">${escape(s.summary)}${s.summary ? ' · ' : ''}Level ${s.level} · ${when(s.updated)}</span>
          </div>
          <div class="save-acts">
            <button class="btn" data-act="load">Load</button>
            ${onEdit ? '<button class="btn ghost" data-act="edit">Edit look</button>' : ''}
            <button class="btn ghost" data-act="export">Save to file</button>
            <button class="btn ghost" data-act="delete">Delete</button>
          </div>
        </li>`).join('')}</ul>` : '<p class="muted">No saved characters.</p>'}
      <button class="link-btn" data-act="back">Back to title</button>
    </section>`;
  root.querySelector('[data-act=back]').addEventListener('click', onBack);
  root.querySelectorAll('.save-list li').forEach(li => {
    const id = li.dataset.id;
    li.querySelector('[data-act=load]').addEventListener('click', () => onLoad(id));
    li.querySelector('[data-act=export]').addEventListener('click', () => onExport(id));
    li.querySelector('[data-act=edit]')?.addEventListener('click', () => onEdit(id));
    const del = li.querySelector('[data-act=delete]');
    // two steps instead of a browser dialog
    del.addEventListener('click', () => {
      if (del.dataset.armed) return onDelete(id);
      del.dataset.armed = '1'; del.textContent = 'Delete for good?'; del.classList.add('danger');
      setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.textContent = 'Delete'; del.classList.remove('danger'); } }, 4000);
    });
  });
  (root.querySelector('[data-act=load]') || root.querySelector('[data-act=back]')).focus({ preventScroll: true });
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
