-- SQL Server schema for the voting backend.
-- Run with:  npm run db:init   (creates the tables if they don't exist yet; safe to re-run)
--
-- Votes are NOT stored here. Ballots live only on the blockchain; this database
-- holds accounts, election drafts, and voter registrations.

IF OBJECT_ID('dbo.Users', 'U') IS NULL
CREATE TABLE dbo.Users (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    full_name     NVARCHAR(150)  NOT NULL,
    email         NVARCHAR(255)  NOT NULL CONSTRAINT UQ_Users_email UNIQUE,
    student_id    NVARCHAR(50)   NULL,
    password_hash NVARCHAR(255)  NOT NULL,
    role          NVARCHAR(10)   NOT NULL CONSTRAINT CK_Users_role CHECK (role IN ('admin', 'voter')),
    created_at    DATETIME2      NOT NULL CONSTRAINT DF_Users_created_at DEFAULT SYSUTCDATETIME()
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_Users_student_id')
CREATE UNIQUE INDEX UQ_Users_student_id ON dbo.Users (student_id) WHERE student_id IS NOT NULL;

IF OBJECT_ID('dbo.Elections', 'U') IS NULL
CREATE TABLE dbo.Elections (
    id                INT IDENTITY(1,1) PRIMARY KEY,
    title             NVARCHAR(200)  NOT NULL,
    description       NVARCHAR(MAX)  NULL,
    start_time        DATETIME2      NOT NULL,   -- UTC
    end_time          DATETIME2      NOT NULL,   -- UTC
    chain_election_id INT            NULL,       -- id in the VotingV2 contract once published
    published_at      DATETIME2      NULL,
    cancelled_at      DATETIME2      NULL,
    created_by        INT            NOT NULL CONSTRAINT FK_Elections_Users REFERENCES dbo.Users(id),
    created_at        DATETIME2      NOT NULL CONSTRAINT DF_Elections_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Elections_times CHECK (end_time > start_time)
);

IF OBJECT_ID('dbo.Candidates', 'U') IS NULL
CREATE TABLE dbo.Candidates (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    election_id INT            NOT NULL CONSTRAINT FK_Candidates_Elections REFERENCES dbo.Elections(id) ON DELETE CASCADE,
    name        NVARCHAR(150)  NOT NULL,
    party       NVARCHAR(100)  NULL,
    chain_index INT            NULL,       -- candidate id in the contract once published
    created_at  DATETIME2      NOT NULL CONSTRAINT DF_Candidates_created_at DEFAULT SYSUTCDATETIME()
);

-- A voter's request to take part in an election. The commitment is a public value
-- derived from a secret that only exists in the voter's browser.
IF OBJECT_ID('dbo.Registrations', 'U') IS NULL
CREATE TABLE dbo.Registrations (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    election_id INT            NOT NULL CONSTRAINT FK_Registrations_Elections REFERENCES dbo.Elections(id) ON DELETE CASCADE,
    user_id     INT            NOT NULL CONSTRAINT FK_Registrations_Users REFERENCES dbo.Users(id),
    commitment  VARCHAR(80)    NOT NULL,   -- uint256 as a decimal string
    status      NVARCHAR(10)   NOT NULL CONSTRAINT DF_Registrations_status DEFAULT 'pending'
                               CONSTRAINT CK_Registrations_status CHECK (status IN ('pending', 'approved', 'rejected')),
    on_chain    BIT            NOT NULL CONSTRAINT DF_Registrations_on_chain DEFAULT 0,
    group_index INT            NULL,       -- position in the election's Semaphore group
    reviewed_by INT            NULL CONSTRAINT FK_Registrations_Reviewer REFERENCES dbo.Users(id),
    reviewed_at DATETIME2      NULL,
    created_at  DATETIME2      NOT NULL CONSTRAINT DF_Registrations_created_at DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Registrations_user UNIQUE (election_id, user_id),
    CONSTRAINT UQ_Registrations_commitment UNIQUE (election_id, commitment)
);

-- Transactions sent by the relayer, for performance evaluation.
-- Deliberately holds no user id, IP address, or commitment.
IF OBJECT_ID('dbo.RelayLog', 'U') IS NULL
CREATE TABLE dbo.RelayLog (
    id                INT IDENTITY(1,1) PRIMARY KEY,
    kind              NVARCHAR(20)   NOT NULL,   -- 'vote', 'finalize', 'admin'
    chain_election_id INT            NULL,
    tx_hash           VARCHAR(66)    NULL,
    status            NVARCHAR(10)   NOT NULL,   -- 'success', 'rejected', 'failed'
    error_code        NVARCHAR(100)  NULL,
    gas_used          BIGINT         NULL,
    latency_ms        INT            NULL,       -- request received -> transaction confirmed
    created_at        DATETIME2      NOT NULL CONSTRAINT DF_RelayLog_created_at DEFAULT SYSUTCDATETIME()
);
