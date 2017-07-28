CREATE TABLE flightstats_ratings (
	 flight CHAR(10) NOT NULL,
	 date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	 observations INT NOT NULL,
	 ontime INT NOT NULL,
	 late15 INT NOT NULL,
	 late30 INT NOT NULL,
	 late45 INT NOT NULL,
	 cancelled INT NOT NULL,
	 diverted INT NOT NULL,
	 delayMax INT NOT NULL,
	PRIMARY KEY(flight)
);

CREATE TABLE states (
    device_address CHAR(33) NOT NULL,
    flight CHAR(10),
    delay INT,
    compensation INT,
    price INT,
    date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (device_address)
);

CREATE INDEX byStates ON states(device_address);

CREATE TABLE contracts (
	 feed_name CHAR(30) NOT NULL,
	 date TIMESTAMP NOT NULL,
	 delay INT NOT NULL,
	 shared_address CHAR(32) NOT NULL,
	 timeout BIGINT NOT NULL,
	 checked_timeout INT NOT NULL DEFAULT 0,
	 refunded INT NOT NULL DEFAULT 0,
	 checked_flight INT NOT NULL DEFAULT 0,
	 unlocked INT NOT NULL DEFAULT 0,
	 creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	 peer_address CHAR(32) NOT NULL,
	 peer_device_address CHAR(33) NOT NULL,
	 peer_amount INT NOT NULL,
	 asset CHAR(44),
	 amount INT NOT NULL,
	 winner CHAR(10),
	PRIMARY KEY(shared_address),
	FOREIGN KEY (shared_address) REFERENCES shared_addresses(shared_address),
	FOREIGN KEY (asset) REFERENCES assets(unit)
);