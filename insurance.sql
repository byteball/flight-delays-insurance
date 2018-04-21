CREATE TABLE flightstats_ratings (
	flight CHAR(10) NOT NULL PRIMARY KEY,
	date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	observations INT NOT NULL,
	ontime INT NOT NULL,
	late15 INT NOT NULL,
	late30 INT NOT NULL,
	late45 INT NOT NULL,
	cancelled INT NOT NULL,
	diverted INT NOT NULL,
	delayMax INT NOT NULL,
	departure_airport CHAR(3),
	arrival_airport CHAR(3)
);

CREATE TABLE states (
	device_address CHAR(33) NOT NULL PRIMARY KEY,
	flight CHAR(10),
	delay INT,
	compensation DECIMAL(15,9),
	price INT,
	date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	departure_airport CHAR(3),
	arrival_airport CHAR(3),
	FOREIGN KEY (device_address) REFERENCES correspondent_devices(device_address)
);

CREATE TABLE contracts (
	feed_name CHAR(30) NOT NULL,
	date TIMESTAMP NOT NULL,
	delay INT NOT NULL,
	shared_address CHAR(32) NOT NULL,
	timeout BIGINT NOT NULL,
	checked_timeout_date TIMESTAMP NULL,
	refunded INT NOT NULL DEFAULT 0,
	checked_flight_date TIMESTAMP NULL,
	unlocked_date TIMESTAMP NULL,
	creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	peer_address CHAR(32) NOT NULL,
	peer_device_address CHAR(33) NOT NULL,
	peer_amount INT NOT NULL,
	asset CHAR(44),
	amount INT NOT NULL,
	winner CHAR(10),
	unlock_unit CHAR(44),
	departure_airport CHAR(3),
	arrival_airport CHAR(3),
	PRIMARY KEY(shared_address),
	FOREIGN KEY (shared_address) REFERENCES shared_addresses(shared_address),
	FOREIGN KEY (unlock_unit) REFERENCES units(unit),
	FOREIGN KEY (asset) REFERENCES assets(unit)
);

CREATE INDEX byCheckedTimeoutDate ON contracts(checked_timeout_date);
CREATE INDEX byCheckedFlightDate ON contracts(checked_flight_date);

CREATE TABLE `weather_cache` (
	`airport`	TEXT NOT NULL UNIQUE,
	`weather`	TEXT,
	`ts`	INTEGER NOT NULL
);

/*

ALTER TABLE states ADD COLUMN departure_airport CHAR(3);
ALTER TABLE states ADD COLUMN arrival_airport CHAR(3);
ALTER TABLE contracts ADD COLUMN departure_airport CHAR(3);
ALTER TABLE contracts ADD COLUMN arrival_airport CHAR(3);
ALTER TABLE flightstats_ratings ADD COLUMN departure_airport CHAR(3);
ALTER TABLE flightstats_ratings ADD COLUMN arrival_airport CHAR(3);

*/

