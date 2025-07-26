document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const verifyForm = document.getElementById('verifyForm');
    const registerForm = document.getElementById('registerForm');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('loginEmail').value;
            const password = document.getElementById('loginPassword').value;
            const messageEl = document.getElementById('loginMessage');
            messageEl.textContent = '';

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();

                if (response.ok && data.redirectUrl) {
                    window.location.href = data.redirectUrl;
                } else {
                    messageEl.textContent = data.message || 'Login failed.';
                    messageEl.style.color = 'red';
                }
            } catch (error) {
                messageEl.textContent = 'An error occurred while connecting to the server.';
                messageEl.style.color = 'red';
            }
        });
    }
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const companyName = document.getElementById('registerCompanyName').value;
            const email = document.getElementById('registerEmail').value;
            const password = document.getElementById('registerPassword').value;
            const messageEl = document.getElementById('registerMessage');
            messageEl.textContent = '';

            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ companyName, email, password })
                });
                
                const data = await response.json();

                if (response.ok && data.redirectUrl) {
                    window.location.href = data.redirectUrl;
                } else {
                    messageEl.textContent = data.message || 'Registration failed.';
                    messageEl.style.color = 'red';
                }
            } catch (error) {
                messageEl.textContent = 'An error occurred while connecting to the server.';
                messageEl.style.color = 'red';
            }
        });
    }
});