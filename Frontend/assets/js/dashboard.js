document.addEventListener("DOMContentLoaded", async () => {
    const list = document.getElementById("ambulance-list");
    
    // Mock data - Replace with: const ambulances = await apiRequest('/ambulances');
    const ambulances = [
        { id: 1, type: "ICU Support", status: "Available", price: "$50" },
        { id: 2, type: "Basic Transport", status: "Busy", price: "$30" }
    ];

    ambulances.forEach(amb => {
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
            <h3>${amb.type}</h3>
            <p>Status: <span class="status-available">${amb.status}</span></p>
            <p>Rate: ${amb.price}/km</p>
            <button onclick="bookAmbulance(${amb.id})">Book Now</button>
        `;
        list.appendChild(card);
    });
});

function bookAmbulance(id) {
    alert("Booking ambulance ID: " + id);
}