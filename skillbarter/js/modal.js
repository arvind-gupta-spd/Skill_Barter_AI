const modalContainer = document.getElementById('modal-container');

export function renderModal(content) {
  modalContainer.innerHTML = `
    <div id="modal-backdrop" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-xl relative modal-content">
        <button data-action="close-modal" class="absolute top-4 right-4 text-gray-600 text-2xl">&times;</button>
        ${content}
      </div>
    </div>
  `;
  modalContainer.querySelector('#modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });
  modalContainer.querySelector('[data-action="close-modal"]')?.addEventListener('click', closeModal);
}

export function closeModal() {
  modalContainer.innerHTML = '';
}
