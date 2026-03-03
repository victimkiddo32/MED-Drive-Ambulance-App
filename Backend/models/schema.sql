CREATE DATABASE AmbulanceServiceDMS;
USE AmbulanceServiceDBMS;


CREATE TABLE `Users` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `phone_number` varchar(15) NOT NULL,
  `role` enum('User','Provider','Driver','Admin') DEFAULT 'User',
  `org_id` int DEFAULT NULL,
  `address` text DEFAULT NULL,
  PRIMARY KEY (`user_id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `phone_number` (`phone_number`),
  CONSTRAINT `fk_1` FOREIGN KEY (`org_id`) REFERENCES `Organizations` (`org_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=30001;


CREATE TABLE `Hospitals` (
`hospital_id` int NOT NULL AUTO_INCREMENT,
`hospital_name` varchar(100) NOT NULL,
`location` varchar(100) DEFAULT NULL,
`contact_no` varchar(15) DEFAULT NULL,
PRIMARY KEY (`hospital_id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin 
auto_increment=10001;


CREATE TABLE `Drivers` (
`driver_id` int NOT NULL AUTO_INCREMENT,
`name` varchar(100) NOT NULL,
`license_number` varchar(50) DEFAULT NULL,
`rating` decimal(3,2) DEFAULT '5.00',
`status` varchar(20) DEFAULT NULL,
`created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
`daily_earnings` decimal(10,2) DEFAULT '0.00',
`total_trips` int DEFAULT '0',
`phone_number` varchar(20) NOT NULL,
`is_online` tinyint(1) DEFAULT '0',
`user_id` int DEFAULT NULL,
PRIMARY KEY (`driver_id`) /*T![clustered_index] CLUSTERED */,
UNIQUE KEY `user_id` (`user_id`),
CONSTRAINT `fk_driver_user` FOREIGN KEY (`user_id`) REFERENCES `Users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=60001;


CREATE TABLE `Ambulances` (
`ambulance_id` int NOT NULL AUTO_INCREMENT,
`provider_id` int DEFAULT NULL,
`vehicle_number` varchar(50) DEFAULT NULL,
`ambulance_type` varchar(100) DEFAULT NULL,
`status` enum('Available','Busy','Offline') DEFAULT 'Available',
`current_location` varchar(100) DEFAULT NULL,
`hospital_id` int DEFAULT NULL,
`driver_id` int DEFAULT NULL,
`provider_email` varchar(255) DEFAULT NULL,
`image_url` varchar(255) DEFAULT NULL,
`base_fare` decimal(10,2) DEFAULT '500.00',
PRIMARY KEY (`ambulance_id`) /*T![clustered_index] CLUSTERED */,
UNIQUE KEY `vehicle_number` (`vehicle_number`),
KEY `fk_1` (`provider_id`),
KEY `fk_2` (`hospital_id`),
KEY `fk_ambulance_driver_user` (`driver_id`),
CONSTRAINT `fk_1` FOREIGN KEY (`provider_id`) REFERENCES `Providers` (`provider_id`) ON DELETE CASCADE,
CONSTRAINT `fk_2` FOREIGN KEY (`hospital_id`) REFERENCES `Hospitals` (`hospital_id`) ON DELETE SET NULL,
CONSTRAINT `fk_ambulance_driver_user` FOREIGN KEY (`driver_id`) REFERENCES `Drivers` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=60001


CREATE TABLE `Bookings` (
`booking_id` int NOT NULL AUTO_INCREMENT,
`user_id` int DEFAULT NULL,
`ambulance_id` int DEFAULT NULL,
`pickup_location` varchar(255) DEFAULT NULL,
`destination_hospital` varchar(255) DEFAULT NULL,
`booking_time` timestamp DEFAULT CURRENT_TIMESTAMP,
`status` varchar(20) DEFAULT NULL,
`fare` decimal(10,2) DEFAULT NULL,
`base_fare` decimal(10,2) NOT NULL DEFAULT '500.00',
`driver_user_id` int DEFAULT NULL,
`created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
PRIMARY KEY (`booking_id`) /*T![clustered_index] CLUSTERED */,
KEY `fk_1` (`user_id`),
KEY `fk_2` (`ambulance_id`),
CONSTRAINT `fk_1` FOREIGN KEY (`user_id`) REFERENCES `Users` (`user_id`) ON DELETE CASCADE,
CONSTRAINT `fk_2` FOREIGN KEY (`ambulance_id`) REFERENCES `Ambulances` (`ambulance_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=100002



CREATE TABLE `Providers` (
`provider_id` int NOT NULL AUTO_INCREMENT,
`user_id` int DEFAULT NULL,
`company_name` varchar(100) NOT NULL,
`trade_license` varchar(50) DEFAULT NULL,
PRIMARY KEY (`provider_id`) /*T![clustered_index] CLUSTERED */,
UNIQUE KEY `user_id` (`user_id`),
CONSTRAINT `fk_1` FOREIGN KEY (`user_id`) REFERENCES `Users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=90001



CREATE TABLE `Organizations` (
`org_id` int NOT NULL AUTO_INCREMENT,
`org_name` varchar(255) DEFAULT NULL,
`email_domain` varchar(255) DEFAULT NULL,
`discount_rate` decimal(5,2) DEFAULT NULL,
PRIMARY KEY (`org_id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin AUTO_INCREMENT=30002

CREATE TABLE `Reviews` (
`review_id` int NOT NULL AUTO_INCREMENT,
`booking_id` int DEFAULT NULL,
`rating` int DEFAULT NULL,
`comment` text DEFAULT NULL,
`created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
PRIMARY KEY (`review_id`) /*T![clustered_index] CLUSTERED */,
UNIQUE KEY `booking_id` (`booking_id`),
CONSTRAINT `fk_1` FOREIGN KEY (`booking_id`) REFERENCES `Bookings` (`booking_id`) ON DELETE CASCADE,
CONSTRAINT `reviews_chk_1` CHECK ((`rating` >= 1 and `rating` <= 5))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin



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




SELECT 
    a.vehicle_number, 
    a.ambulance_type, 
    a.current_location, 
    d.name AS driver_name, 
    d.phone_number AS driver_contact,
    h.hospital_name AS base_hospital
FROM Ambulances a
JOIN Drivers d ON a.driver_id = d.user_id
LEFT JOIN Hospitals h ON a.hospital_id = h.hospital_id
WHERE a.status = 'Available' 
  AND a.ambulance_type = 'ICU'
ORDER BY d.rating DESC;


SELECT 
    b.booking_id,
    u.full_name AS customer_name,
    o.org_name AS organization,
    b.base_fare AS standard_price,
    o.discount_rate,
    (b.base_fare - (b.base_fare * o.discount_rate / 100)) AS final_discounted_fare
FROM Bookings b
JOIN Users u ON b.user_id = u.user_id
JOIN Organizations o ON u.org_id = o.org_id
WHERE b.booking_id = 100002;


SELECT 
    d.name AS driver_name,
    COUNT(b.booking_id) AS total_trips_completed,
    SUM(b.fare) AS total_revenue_generated,
    ROUND(AVG(r.rating), 2) AS average_customer_rating
FROM Drivers d
JOIN Bookings b ON d.user_id = b.driver_user_id
LEFT JOIN Reviews r ON b.booking_id = r.booking_id
WHERE b.status = 'Completed'
GROUP BY d.driver_id, d.name
HAVING total_trips_completed > 0
ORDER BY total_revenue_generated DESC;