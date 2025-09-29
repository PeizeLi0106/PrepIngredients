function setupPortionModal() {
  // Remember what was clicked
  let clicked = { kind: null, action: null };

  // 1) When a + button is clicked -> open modal and remember its URL + kind
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('.portion-trigger');
    if (!trigger) return;

    clicked.kind = trigger.dataset.kind;        // "regular" | "urgent"
    clicked.action = trigger.dataset.action;    // item-specific /remain/... URL

    const modal = new bootstrap.Modal(document.getElementById('portionModal'));
    modal.show();
  });

  // 2) When a portion size is chosen -> set form.action dynamically and submit
  document.addEventListener('click', (e) => {
    const option = e.target.closest('.portion-option');
    if (!option || !clicked.kind || !clicked.action) return;

    const form = document.getElementById('portionForm');
    form.action = clicked.action;  // this ties the request to the item you clicked

    form.innerHTML = `
      <input type="hidden" name="urgency" value="${clicked.kind}">
      <input type="hidden" name="portion" value="${option.dataset.portion}">
    `;

    const modal = bootstrap.Modal.getInstance(document.getElementById('portionModal'));
    if (modal) modal.hide();

    form.submit();
  });
}

setupPortionModal();

// Function to open the dialog
function openDialog() {
    const dialog = document.getElementById('dialog-box');
    dialog.style.display = 'block';
}

// Function to close the dialog
function closeDialog() {
    const dialog = document.getElementById('dialog-box');
    dialog.style.display = 'none';
}

// Function to set the category value
function setCategory(category) {
    const categoryInput = document.getElementById('category-input');
    categoryInput.value = category;
    alert(`Category set to: ${category}`); // Optional visual feedback
}

// Function to submit the form with meat/veg classification
function submitForm(prepSide) {
    const form = document.getElementById('upload-form');
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'prep_side';
    input.value = prepSide; // 'meat' or 'veg'
    form.appendChild(input);
    form.submit();
}

async function sendHelpSignal() {
    const response = await fetch('/help', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
    });
    if (response.ok) {
        //console.log('Help signal sent successfully!');
    } else {
        console.error('Failed to send help signal.');
    }
}

function openEditDialog(name, mandarin, german) {
    const dialog = document.getElementById('edit-dialog-box');
    dialog.style.display = 'block';

    // Prefill the form with the existing data
    document.getElementById('edit-ingredient-name').value = name;
    document.getElementById('edit-category-input').value = ''; // Reset category
    document.getElementById('edit-file-input').value = ''; // Reset file input

    // Set the form action to the edit route
    const form = document.getElementById('edit-form');
    form.action = `/edit/${name}`;
}

function closeEditDialog() {
    const dialog = document.getElementById('edit-dialog-box');
    dialog.style.display = 'none';
}

function setEditCategory(category) {
    const categoryInput = document.getElementById('edit-category-input');
    categoryInput.value = category;
    alert(`Category set to: ${category}`); // Optional feedback
}

function submitEditForm(prepSide) {
    const form = document.getElementById('edit-form');
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'prep_side';
    input.value = prepSide; // 'meat' or 'veg'
    form.appendChild(input);
    form.submit();
}
function confirmDelete(formId) {
    if (confirm("Are you sure you want to delete this item?")) {
        document.getElementById(`delete-form-${formId}`).submit();
    }
}