document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Element Selectors ---
    const templatesListDiv = document.getElementById('templates-list');
    const templateModalEl = document.getElementById('templateModal');
    const templateModal = new bootstrap.Modal(templateModalEl);
    const templateForm = document.getElementById('templateForm');
    const botEnabledSwitch = document.getElementById('botEnabledSwitch');
    const templateModalLabel = document.getElementById('templateModalLabel');
    const templateIdInput = document.getElementById('templateId');
    const templateNameInput = document.getElementById('templateName');
    const templateTextInput = document.getElementById('templateText');
    const templateTypeTextRadio = document.getElementById('templateTypeText');
    const templateTypeInteractiveRadio = document.getElementById('templateTypeInteractive');
    const buttonsContainer = document.getElementById('buttons-container');
    const addNewTemplateBtn = document.getElementById('addNewTemplateBtn');
    const saveTemplateBtn = document.getElementById('saveTemplateBtn');

    const buttonFields = [
        { title: document.getElementById('templateButton1Title'), select: document.getElementById('templateButton1NextFlow') },
        { title: document.getElementById('templateButton2Title'), select: document.getElementById('templateButton2NextFlow') },
        { title: document.getElementById('templateButton3Title'), select: document.getElementById('templateButton3NextFlow') }
    ];


    let allTemplates = []; // To store all templates for the dropdowns

    // --- 2. Validation Functions (NEW) ---

    /**
     * Checks all button titles for validity and enables/disables the save button.
     */
    function checkFormValidity() {
        // Only validate if the buttons container is visible
        if (buttonsContainer.classList.contains('d-none')) {
            saveTemplateBtn.disabled = false;
            return;
        }

        const isInvalid = buttonFields.some(field =>
            field.title && field.title.classList.contains('is-invalid')
        );
        saveTemplateBtn.disabled = isInvalid;
    }

    /**
     * Validates a single button title input field.
     * @param {HTMLInputElement} inputEl - The input field for the button title.
     * @param {HTMLElement} counterEl - The small element for displaying the character count.
     */
    function validateButtonTitle(inputEl, counterEl) {
        if (!inputEl || !counterEl) return;

        const maxLength = 20;
        const currentLength = inputEl.value.trim().length;
        counterEl.textContent = `${currentLength} / ${maxLength}`;

        if (currentLength > maxLength) {
            inputEl.classList.add('is-invalid');
            counterEl.classList.add('text-danger');
        } else {
            inputEl.classList.remove('is-invalid');
            counterEl.classList.remove('text-danger');
        }
        checkFormValidity();
    }

    /**
     * Resets the validation state for all button fields.
     */
    function resetValidation() {
        buttonFields.forEach(field => {
            if (field.title && field.counter) {
                field.title.classList.remove('is-invalid');
                field.counter.classList.remove('text-danger');
                field.counter.textContent = '';
            }
        });
        saveTemplateBtn.disabled = false;
    }

     // --- 3. Main Functions ---
    /**
     * Fetches all templates from the API and renders them on the page.
     */
    async function loadTemplatesAndSettings() {
        try {
            templatesListDiv.innerHTML = `<div class="text-center p-5"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>`;
            
            const settingsResponse = await fetch('/api/bot-settings/status');
            if (!settingsResponse.ok) throw new Error('Failed to fetch bot settings');
            const companySettings = await settingsResponse.json();

            if (botEnabledSwitch) {
                botEnabledSwitch.checked = companySettings.isBotEnabled;
            }
            
            const templatesResponse = await fetch('/api/templates');
            if (!templatesResponse.ok) throw new Error('Failed to fetch templates');
            allTemplates = await templatesResponse.json();
            
            renderTemplateList(allTemplates, companySettings);
            populateTemplateDropdowns(allTemplates);

        } catch (error) {
            console.error(error);
            templatesListDiv.innerHTML = '<p class="text-center text-danger p-5">Failed to load data. Please refresh.</p>';
        }
    }

    /**
     * Opens the modal and populates it with data from an existing template for editing.
     * @param {object} template - The template object to edit.
     */
    function openModalForEdit(template) {
        templateForm.reset(); // Clear the form first
        resetValidation();
        
        templateModalLabel.textContent = 'تعديل القالب'; // Change modal title
        templateIdInput.value = template._id; // IMPORTANT: Set the hidden ID
        templateNameInput.value = template.name;
        templateTextInput.value = template.text;

        const typeRadio = document.querySelector(`input[name="templateType"][value="${template.type}"]`);
        if(typeRadio) typeRadio.checked = true;

        buttonsContainer.classList.toggle('d-none', template.type !== 'interactive');

        if (template.type === 'interactive') {
            templateTypeInteractiveRadio.checked = true;
            buttonsContainer.classList.remove('d-none');
            // Populate button fields
            template.buttons.forEach((button, index) => {
                if (buttonFields[index]) {
                    buttonFields[index].title.value = button.title;
                    buttonFields[index].select.value = button.nextTemplateId || '';
                    validateButtonTitle(buttonFields[index].title, buttonFields[index].counter);
                }
            });
        } else {
            buttonsContainer.classList.add('d-none');
        }

        templateModal.show(); // Show the modal
    }

    /**
     * Renders the list of template cards into the DOM.
     * @param {Array} templates - An array of template objects.
     * @param {Object} companySettings - The company settings object.
     */
    function renderTemplateList(templates, companySettings) {
        templatesListDiv.innerHTML = '';
        if (templates.length === 0) {
            templatesListDiv.innerHTML = '<p class="text-center text-secondary p-5">لا توجد قوالب محفوظة.</p>';
            return;
        }
        const templatesHTML = templates.map(template => renderTemplateCard(template, companySettings)).join('');
        templatesListDiv.innerHTML = `<div class="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-4">${templatesHTML}</div>`;
    }

    /**
     * Creates the HTML for a single template card.
     * @param {object} template - The template data object.
     * @param {Object} companySettings - The company settings object.
     * @returns {string} - The HTML string for the card.
     */
    function renderTemplateCard(template, companySettings) {
        let typeBadgeColor = 'bg-info';
        let typeText = template.type;
        if (template.type === 'interactive') {
            typeBadgeColor = 'bg-success';
        } else if (template.type === 'contact_agent') {
            typeBadgeColor = 'bg-warning text-dark';
            typeText = 'Contact Agent';
        } else if (template.type === 'resolve_conversation') {
            typeBadgeColor = 'bg-danger';
            typeText = 'Resolve Conversation';
        }

        const isWelcomeTemplate = companySettings.welcomeTemplateId === template._id;
        
        // Find the names of the next templates for the buttons
        const buttonsHTML = template.buttons && template.buttons.length > 0 ? template.buttons.map(btn => {
            const nextTemplate = allTemplates.find(t => t._id === btn.nextTemplateId);
            const nextTemplateName = nextTemplate ? nextTemplate.name : 'End of Flow';
            return `<li class="list-group-item d-flex justify-content-between align-items-center">
                        <span>${btn.title}</span>
                        <small class="text-muted">→ ${nextTemplateName}</small>
                    </li>`;
        }).join('') : '';

        const welcomeButtonHTML = `
            <button 
                class="btn btn-sm ${isWelcomeTemplate ? 'btn-success' : 'btn-outline-success'} btn-set-welcome" 
                data-id="${template._id}" 
                ${isWelcomeTemplate ? 'disabled' : ''}>
                <i class="bi ${isWelcomeTemplate ? 'bi-check-circle-fill' : 'bi-play-circle'} me-1"></i>
                ${isWelcomeTemplate ? 'الرسالة الترحيبية الحالية' : 'تعيين كرسالة ترحيب'}
            </button>
        `;

        return `
            <div class="col">
                <div class="card h-100">
                    <div class="card-body d-flex flex-column">
                        <div class="d-flex justify-content-between">
                            <h5 class="card-title">${template.name}</h5>
                            <span class="badge ${typeBadgeColor}">${template.type}</span>
                        </div>
                        <p class="card-text text-secondary mt-2 flex-grow-1" style="white-space: pre-wrap;">${template.text}</p>
                        ${template.type === 'interactive' && buttonsHTML ? `<ul class="list-group list-group-flush mt-3">${buttonsHTML}</ul>` : ''}
                    </div>
                    <div class="card-footer d-flex justify-content-between align-items-center bg-transparent border-top-0">
                        ${welcomeButtonHTML}
                        <div>
                            <button class="btn btn-sm btn-outline-primary me-2" data-id="${template._id}">تعديل</button>
                            <button class="btn btn-sm btn-outline-danger" data-id="${template._id}">حذف</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Populates all the 'Next Flow' dropdowns with the list of available templates.
     * @param {Array} templates - An array of template objects.
     */
    function populateTemplateDropdowns(templates) {
        const optionsHTML = templates.map(t => `<option value="${t._id}">${t.name}</option>`).join('');
        buttonFields.forEach(field => {
            field.select.innerHTML = `<option selected value="">-- اختر التدفق التالي (اختياري) --</option>${optionsHTML}`;
        });
    }

    // --- 3. Event Listeners ---

    buttonFields.forEach(field => {
        if(field.title) {
            field.title.addEventListener('input', () => validateButtonTitle(field.title, field.counter));
        }
    });

    if (botEnabledSwitch) {
        botEnabledSwitch.addEventListener('change', async () => {
            const isEnabled = botEnabledSwitch.checked;
            
            // --- 1. الكاشف الأول: هل يعمل الزر؟ ---
            console.log(`--- Button Toggled ---`);
            console.log(`New state to be sent: ${isEnabled}`);

            try {
                const response = await fetch('/api/bot-settings/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isEnabled })
                });

                const data = await response.json();

                // --- 2. الكاشف الثاني: ماذا رد الخادم؟ ---
                console.log("Server response:", data);

                if (!response.ok) {
                    throw new Error(data.message || 'Failed to update bot status');
                }

                // --- 3. الكاشف الثالث: إعادة تحميل البيانات للتأكيد ---
                console.log("Reloading all settings to confirm the change...");
                await loadTemplatesAndSettings();
                console.log("Reload complete. The button should now reflect the saved state.");

            } catch (error) {
                console.error("### FATAL ERROR while toggling bot:", error);
                // في حالة الخطأ، أعد تحميل الحالة من الخادم لإعادة الزر إلى وضعه الصحيح
                await loadTemplatesAndSettings();
            }
        });
    }
    // مستمع لأزرار "تعيين كرسالة ترحيب"
    templatesListDiv.addEventListener('click', async (e) => {
        const setWelcomeButton = e.target.closest('.btn-set-welcome');
        if (setWelcomeButton) {
            e.preventDefault();
            const templateId = setWelcomeButton.dataset.id;
            try {
                await fetch('/api/bot-settings/set-welcome', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ templateId })
                });
                loadTemplatesAndSettings(); // أعد تحميل القائمة لتحديث شكل الأزرار
            } catch (error) {
                console.error("Failed to set welcome template:", error);
                showStatusModal('فشل التعيين', 'حدث خطأ أثناء تعيين القالب كرسالة ترحيب.', 'error');
                setTimeout(hideStatusModal, 2000); // إخفاء بعد ثانيتين
            }
        }
    });

    // Show/hide button fields based on template type selection
    [templateTypeTextRadio, templateTypeInteractiveRadio].forEach(radio => {
        radio.addEventListener('change', () => {
            buttonsContainer.classList.toggle('d-none', !templateTypeInteractiveRadio.checked);
        });
    });
    document.querySelectorAll('input[name="templateType"]').forEach(radio => {
        radio.addEventListener('change', () => {
            buttonsContainer.classList.toggle('d-none', radio.value !== 'interactive');
            // When hiding, reset validation to re-enable save button
            if (radio.value !== 'interactive') {
                resetValidation();
            }
        });
    });

    addNewTemplateBtn.addEventListener('click', () => {
        templateForm.reset(); // إعادة تعيين كل الحقول
        resetValidation(); // إعادة تعيين حالة التحقق
        templateIdInput.value = ''; // الأهم: تفريغ حقل الـ ID المخفي
        templateModalLabel.textContent = 'إضافة قالب جديد'; // إعادة تعيين عنوان النافذة
        buttonsContainer.classList.add('d-none'); // إخفاء قسم الأزرار
        templateTypeTextRadio.checked = true; // التأكد من اختيار "نص فقط" كافتراضي
    });

    // NEW: Event listener for Edit and Delete buttons on the template cards
    templatesListDiv.addEventListener('click', (e) => {
        const editButton = e.target.closest('.btn-outline-primary'); // Find edit button
        
        if (editButton) {
            e.preventDefault();
            const templateId = editButton.dataset.id;
            const templateToEdit = allTemplates.find(t => t._id === templateId);
            if (templateToEdit) {
                openModalForEdit(templateToEdit);
            }
        }
        // We can add delete logic here later
    });

    // Handle the form submission for creating/updating a template
    templateForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const templateId = templateIdInput.value;
        const isEditing = !!templateId; // Check if we are in edit mode

        const buttons = buttonFields
            .map(field => ({
                title: field.title.value.trim(),
                nextTemplateId: field.select.value || null
            }))
            .filter(btn => btn.title !== '');

        const selectedType = document.querySelector('input[name="templateType"]:checked').value;

        const templateData = {
            name: templateNameInput.value,
            text: templateTextInput.value,
            type: selectedType,
            buttons: buttons
        };

        const url = isEditing ? `/api/templates/${templateId}` : '/api/templates';
        const method = isEditing ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(templateData)
            });
            if (!response.ok) throw new Error('Failed to save template');
            
            templateModal.hide();
            loadTemplatesAndSettings(); // Refresh the list with updated data
        } catch (error) {
            console.error(error);
            showStatusModal('فشل الحفظ', error.message || 'حدث خطأ أثناء حفظ القالب.', 'error');
            setTimeout(hideStatusModal, 2000); // إخفاء بعد ثانيتين
        }
    });
    
    
    // Reset form when modal is hidden
    templateModalEl.addEventListener('hidden.bs.modal', () => {
        templateForm.reset();
        resetValidation();
        buttonsContainer.classList.add('d-none');
        document.querySelector('input[name="templateType"][value="text"]').checked = true;
    });

    // --- 4. Initial Load ---

    loadTemplatesAndSettings();
});