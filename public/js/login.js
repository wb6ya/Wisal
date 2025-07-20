// public/js/login.js
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

// In public/js/login.js
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Stop the page from refreshing
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const messageEl = document.getElementById('loginMessage');
        messageEl.textContent = '';

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            // --- THIS IS THE NEW DIAGNOSTIC LOG ---
            console.log("Server Response:", data);

            // Check if login was successful and the server sent a redirect URL
            if (response.ok && data.redirectUrl) {
                // If yes, redirect the browser to the dashboard
                window.location.href = data.redirectUrl;
            } else {
                // If not, show an error message
                messageEl.textContent = data.message || 'Login failed.';
                messageEl.style.color = 'red';
            }

        } catch (error) {
            console.error("Login Fetch Error:", error);
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
                const response = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ companyName, email, password })
                });
                
                const data = await response.json();
                messageEl.textContent = data.message;

                if (response.ok) {
                    messageEl.style.color = 'green';
                    registerForm.reset();
                } else {
                    messageEl.style.color = 'red';
                }
            } catch (error) {
                messageEl.textContent = 'An error occurred while connecting to the server.';
                messageEl.style.color = 'red';
            }
        });
    }
});