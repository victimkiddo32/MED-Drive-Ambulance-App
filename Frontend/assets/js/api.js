document.addEventListener('DOMContentLoaded', () => {
    const listContainer = document.getElementById('ambulance-list');

    fetch('http://localhost:5000/api/ambulances')
        .then(response => response.json())
        .then(data => {
            // Clear placeholders
            listContainer.innerHTML = ''; 

            // Add real data from TiDB
            data.forEach(amb => {
                const card = `
                    <div class="card">
                        <h3>${amb.ambulance_type}</h3>
                        <p><strong>Plate:</strong> ${amb.vehicle_number}</p>
                        <p>${amb.current_location}</p>
                        <span class="status ${amb.status.toLowerCase()}">${amb.status}</span>
                        <button class="book-btn" onclick="bookNow(${amb.ambulance_id})">
                            Select for Booking
                        </button>
                    </div>
                `;
                listContainer.innerHTML += card;
            });
        })
        .catch(error => console.error('Error fetching ambulances:', error));
});