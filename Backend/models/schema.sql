CREATE DATABASE AmbulanceServiceDB;
USE AmbulanceServiceDB;

-- 1. Users Table (The patients/requestors)
CREATE TABLE Users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(15) UNIQUE NOT NULL,
    emergency_contact VARCHAR(15),
    address TEXT
);

-- 2. Hospitals Table
CREATE TABLE Hospitals (
    hospital_id INT AUTO_INCREMENT PRIMARY KEY,
    hospital_name VARCHAR(100) NOT NULL,
    location VARCHAR(100),
    contact_no VARCHAR(15)
);

-- 3. Drivers Table
CREATE TABLE Drivers (
    driver_id INT AUTO_INCREMENT PRIMARY KEY,
    driver_name VARCHAR(100) NOT NULL,
    license_no VARCHAR(50) UNIQUE NOT NULL,
    phone_number VARCHAR(15) NOT NULL,
    rating DECIMAL(2,1) DEFAULT 5.0
);

-- 4. Ambulances Table (Linked to Drivers and optionally Hospitals)
CREATE TABLE Ambulances (
    ambulance_id INT AUTO_INCREMENT PRIMARY KEY,
    vehicle_number VARCHAR(20) UNIQUE NOT NULL,
    ambulance_type ENUM('AC', 'Non-AC', 'ICU', 'Freezer') NOT NULL,
    status ENUM('Available', 'Busy', 'Offline') DEFAULT 'Available',
    current_location VARCHAR(100),
    driver_id INT,
    hospital_id INT,
    FOREIGN KEY (driver_id) REFERENCES Drivers(driver_id),
    FOREIGN KEY (hospital_id) REFERENCES Hospitals(hospital_id)
);

-- 5. Bookings Table (The "Heart" of the system)
CREATE TABLE Bookings (
    booking_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    ambulance_id INT,
    pickup_location VARCHAR(255),
    destination_hospital VARCHAR(255),
    booking_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('Pending', 'In-Progress', 'Completed', 'Cancelled') DEFAULT 'Pending',
    fare DECIMAL(10,2),
    FOREIGN KEY (user_id) REFERENCES Users(user_id),
    FOREIGN KEY (ambulance_id) REFERENCES Ambulances(ambulance_id)
);

-- Insert Hospitals
INSERT INTO Hospitals (hospital_name, location, contact_no) VALUES 
('Dhaka Medical College', 'Ramna, Dhaka', '01711111111'),
('Square Hospital', 'Panthapath, Dhaka', '01722222222');

-- Insert Drivers
INSERT INTO Drivers (driver_name, license_no, phone_number) VALUES 
('Abdur Rahman', 'DL-12345', '01810000001'),
('Sabbir Hossain', 'DL-67890', '01810000002');

-- Insert Users
INSERT INTO Users (full_name, phone_number, address) VALUES 
('Karim Uddin', '01500000001', 'Mirpur 10, Dhaka'),
('Rahima Begum', '01500000002', 'Uttara Sector 4, Dhaka');

-- Insert Ambulances
INSERT INTO Ambulances (vehicle_number, ambulance_type, status, current_location, driver_id, hospital_id) VALUES 
('DHAKA-METRO-11', 'ICU', 'Available', 'Mirpur', 1, 1),
('DHAKA-METRO-22', 'AC', 'Available', 'Uttara', 2, 2);

SELECT vehicle_number, current_location, ambulance_type 
FROM Ambulances 
WHERE status = 'Available' AND ambulance_type = 'ICU';

INSERT INTO Bookings (user_id, ambulance_id, pickup_location, destination_hospital, fare)
VALUES (1, 1, 'Mirpur 10', 'Dhaka Medical College', 1500.00);

-- Update ambulance status to Busy
UPDATE Ambulances SET status = 'Busy' WHERE ambulance_id = 1;

SELECT b.booking_id, u.full_name AS Patient, d.driver_name AS Driver, b.status, b.fare
FROM Bookings b
JOIN Users u ON b.user_id = u.user_id
JOIN Ambulances a ON b.ambulance_id = a.ambulance_id
JOIN Drivers d ON a.driver_id = d.driver_id;

SELECT * FROM Ambulances WHERE status = 'Available';

CREATE TABLE Reviews (
    review_id INT PRIMARY KEY AUTO_INCREMENT,
    booking_id INT,
    rating INT CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    FOREIGN KEY (booking_id) REFERENCES Bookings(booking_id)
);