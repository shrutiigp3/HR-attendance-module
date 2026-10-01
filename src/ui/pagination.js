/**
 * High-Performance Reusable Pagination & Control Bar
 * Enables smooth rendering of large datasets (50,000+ items) in small DOM slices
 */

export function paginate(items = [], page = 1, pageSize = 50) {
  const totalItems = items.length;
  const safePageSize = Math.max(1, parseInt(pageSize, 10) || 50);
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));

  const startIndex = (safePage - 1) * safePageSize;
  const endIndex = Math.min(startIndex + safePageSize, totalItems);
  const pageItems = items.slice(startIndex, endIndex);

  return {
    pageItems,
    totalPages,
    totalItems,
    startIndex: totalItems === 0 ? 0 : startIndex + 1,
    endIndex,
    currentPage: safePage,
    pageSize: safePageSize
  };
}

export function renderPaginationBar({
  container,
  currentPage,
  totalPages,
  totalItems,
  startIndex,
  endIndex,
  pageSize,
  pageSizeOptions = [25, 50, 100, 250, 500],
  onPageChange,
  onPageSizeChange
}) {
  if (!container) return;

  const html = `
    <div class="pagination-bar">
      <div class="pagination-info">
        Showing <strong>${startIndex.toLocaleString()}</strong> to <strong>${endIndex.toLocaleString()}</strong> of <strong>${totalItems.toLocaleString()}</strong> records
      </div>

      <div class="pagination-controls">
        <button class="btn btn-outline btn-sm btn-page-first" ${currentPage <= 1 ? 'disabled' : ''} title="First Page">
          « First
        </button>
        <button class="btn btn-outline btn-sm btn-page-prev" ${currentPage <= 1 ? 'disabled' : ''} title="Previous Page">
          ‹ Prev
        </button>
        
        <span class="pagination-badge">
          Page <strong>${currentPage}</strong> of <strong>${totalPages}</strong>
        </span>

        <button class="btn btn-outline btn-sm btn-page-next" ${currentPage >= totalPages ? 'disabled' : ''} title="Next Page">
          Next ›
        </button>
        <button class="btn btn-outline btn-sm btn-page-last" ${currentPage >= totalPages ? 'disabled' : ''} title="Last Page">
          Last »
        </button>

        <div class="pagination-jump">
          <label class="text-xs text-secondary">Jump to:</label>
          <input type="number" class="form-control form-control-sm input-page-jump" min="1" max="${totalPages}" value="${currentPage}" style="width: 70px;">
        </div>
      </div>

      <div class="pagination-size">
        <label class="text-xs text-secondary">Rows per page:</label>
        <select class="form-control form-control-sm select-page-size" style="width: 80px;">
          ${pageSizeOptions.map(opt => `
            <option value="${opt}" ${opt === pageSize ? 'selected' : ''}>${opt}</option>
          `).join('')}
        </select>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Bind handlers
  container.querySelector('.btn-page-first')?.addEventListener('click', () => {
    if (currentPage > 1) onPageChange(1);
  });

  container.querySelector('.btn-page-prev')?.addEventListener('click', () => {
    if (currentPage > 1) onPageChange(currentPage - 1);
  });

  container.querySelector('.btn-page-next')?.addEventListener('click', () => {
    if (currentPage < totalPages) onPageChange(currentPage + 1);
  });

  container.querySelector('.btn-page-last')?.addEventListener('click', () => {
    if (currentPage < totalPages) onPageChange(totalPages);
  });

  const jumpInput = container.querySelector('.input-page-jump');
  jumpInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = parseInt(e.target.value, 10);
      if (!isNaN(val)) {
        const clamped = Math.max(1, Math.min(val, totalPages));
        onPageChange(clamped);
      }
    }
  });

  jumpInput?.addEventListener('blur', (e) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val !== currentPage) {
      const clamped = Math.max(1, Math.min(val, totalPages));
      onPageChange(clamped);
    }
  });

  container.querySelector('.select-page-size')?.addEventListener('change', (e) => {
    const newSize = parseInt(e.target.value, 10) || 50;
    if (onPageSizeChange) onPageSizeChange(newSize);
  });
}
