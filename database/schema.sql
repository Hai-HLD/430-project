--
-- File generated with SQLiteStudio v3.4.17 on Fri Apr 17 15:01:56 2026
--
-- Text encoding used: System
--
PRAGMA foreign_keys = off;
BEGIN TRANSACTION;

-- Table: Messages
-- MessageSender: use "user" for renter/portal user, "staff" for support (API stores lowercase).
CREATE TABLE IF NOT EXISTS Messages (
    MessageID      INTEGER PRIMARY KEY AUTOINCREMENT
                           UNIQUE
                           NOT NULL,
    TicketID               REFERENCES Ticket (TicketID) 
                           NOT NULL,
    MessageContent         NOT NULL,
    MessageSender          NOT NULL,
    DateCreated            NOT NULL
);


-- Table: Ticket
CREATE TABLE IF NOT EXISTS Ticket (
    TicketID     INTEGER PRIMARY KEY AUTOINCREMENT
                         UNIQUE
                         NOT NULL,
    TicketTitle          NOT NULL,
    TicketStatus         NOT NULL,
    DateCreated          NOT NULL,
    LastUpdated          NOT NULL
);


COMMIT TRANSACTION;
PRAGMA foreign_keys = on;
