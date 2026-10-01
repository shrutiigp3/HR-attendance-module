/**
 * Modal Manager for Dialogs, Forms, and Audit Trail Views
 */

export class ModalManager {
  constructor() {
    this.container = null;
    this._init();
  }

  _init() {
    let el = document.getElementById('modal-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'modal-container';
      el.className = 'modal-container';
      document.body.appendChild(el);
    }
    this.container = el;

    // Close on backdrop click or ESC
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.close();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });
  }

  isOpen() {
    return this.container.classList.contains('active');
  }

  open({ title, contentHtml, footerHtml = '', size = 'md' }) {
    this.container.innerHTML = `
      <div class="modal-box modal-${size}">
        <div class="modal-header">
          <h3 class="modal-title">${title}</h3>
          <button type="button" class="modal-close-btn" id="modal-close-x" aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div class="modal-body">
          ${contentHtml}
        </div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
      </div>
    `;

    document.getElementById('modal-close-x')?.addEventListener('click', () => this.close());
    this.container.classList.add('active');
    document.body.classList.add('modal-open');
  }

  close() {
    this.container.classList.remove('active');
    this.container.innerHTML = '';
    document.body.classList.remove('modal-open');
  }
}

export const modal = new ModalManager();
