// Registration Logic
document.getElementById("registerForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const userData = {
        name: document.getElementById("reg-name").value,
        email: document.getElementById("reg-email").value,
        password: document.getElementById("reg-pass").value,
        role: document.getElementById("reg-role").value
    };

    console.log("Registering user...", userData);
    
    // In a real app: 
    // const response = await apiRequest('/auth/register', 'POST', userData);
    // if(response.success) window.location.href = "login.html";

    alert("Registration Successful! Please login.");
    window.location.href = "login.html";
});

// Login Logic (re-pasted for context)
document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    // Logic to verify user...
    window.location.href = "dashboard.html";
});