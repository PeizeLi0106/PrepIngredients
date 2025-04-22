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