IF OBJECT_ID('dbo.users', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.users (
    id NVARCHAR(64) NOT NULL PRIMARY KEY,
    email NVARCHAR(191) NOT NULL UNIQUE,
    name NVARCHAR(191) NOT NULL,
    passwordHash NVARCHAR(255) NOT NULL,
    role NVARCHAR(32) NOT NULL,
    active BIT NOT NULL DEFAULT 1,
    createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('dbo.counters', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.counters (
    id NVARCHAR(64) NOT NULL PRIMARY KEY,
    name NVARCHAR(100) NOT NULL,
    code NVARCHAR(20) NOT NULL UNIQUE,
    active BIT NOT NULL DEFAULT 1,
    createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('dbo.vehicles', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.vehicles (
    id NVARCHAR(64) NOT NULL PRIMARY KEY,
    brand NVARCHAR(100) NOT NULL,
    model NVARCHAR(100) NOT NULL,
    registrationNumber NVARCHAR(50) NULL,
    status NVARCHAR(32) NOT NULL DEFAULT 'AVAILABLE',
    active BIT NOT NULL DEFAULT 1,
    createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_vehicles_status ON dbo.vehicles(status);
  CREATE INDEX IX_vehicles_active ON dbo.vehicles(active);
END;

IF OBJECT_ID('dbo.customers', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.customers (
    id NVARCHAR(64) NOT NULL PRIMARY KEY,
    name NVARCHAR(191) NOT NULL,
    contactNumber NVARCHAR(40) NOT NULL,
    nic NVARCHAR(40) NULL,
    email NVARCHAR(191) NULL,
    createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_customers_contact ON dbo.customers(contactNumber);
END;

IF OBJECT_ID('dbo.settings', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.settings (
    id NVARCHAR(64) NOT NULL PRIMARY KEY,
    companyName NVARCHAR(191) NOT NULL,
    tokenPrefix NVARCHAR(10) NOT NULL DEFAULT '',
    startingTokenNumber INT NOT NULL DEFAULT 1,
    maxTokenNumber INT NOT NULL DEFAULT 50,
    customerCodePrefix NVARCHAR(10) NOT NULL DEFAULT 'C',
    defaultCounterId NVARCHAR(64) NOT NULL,
    audioNotificationEnabled BIT NOT NULL DEFAULT 1,
    textToSpeechEnabled BIT NOT NULL DEFAULT 1,
    displayMode NVARCHAR(20) NOT NULL DEFAULT 'LARGE',
    queueBehavior NVARCHAR(20) NOT NULL DEFAULT 'FIFO',
    autoCompleteOnNext BIT NOT NULL DEFAULT 0,
    upcomingTokensCount INT NOT NULL DEFAULT 3,
    displayShowCustomerName BIT NOT NULL DEFAULT 1,
    timezone NVARCHAR(64) NOT NULL DEFAULT 'Asia/Colombo',
    lastQueueSequence INT NOT NULL DEFAULT 0,
    lastCustomerCodeSequence INT NOT NULL DEFAULT 0,
    updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('dbo.daily_sequences', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.daily_sequences (
    id NVARCHAR(64) NOT NULL PRIMARY KEY,
    businessDate DATE NOT NULL,
    prefix NVARCHAR(20) NOT NULL,
    lastSequence INT NOT NULL DEFAULT 0,
    counterId NVARCHAR(64) NULL,
    CONSTRAINT UQ_daily_sequences UNIQUE (businessDate, prefix)
  );
END;

IF OBJECT_ID('dbo.tokens', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.tokens (
    id NVARCHAR(64) NOT NULL PRIMARY KEY,
    tokenNumber NVARCHAR(20) NOT NULL,
    tokenPrefix NVARCHAR(10) NOT NULL DEFAULT '',
    sequenceNumber INT NOT NULL,
    customerCode NVARCHAR(30) NOT NULL UNIQUE,
    businessDate DATE NOT NULL,
    customerId NVARCHAR(64) NOT NULL,
    vehicleId NVARCHAR(64) NOT NULL,
    testDriveType NVARCHAR(32) NOT NULL,
    status NVARCHAR(32) NOT NULL DEFAULT 'WAITING',
    counterId NVARCHAR(64) NULL,
    issuedBy NVARCHAR(64) NOT NULL,
    calledBy NVARCHAR(64) NULL,
    notes NVARCHAR(MAX) NULL,
    skipReason NVARCHAR(255) NULL,
    cancellationReason NVARCHAR(255) NULL,
    cancelledBy NVARCHAR(64) NULL,
    issuedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    calledAt DATETIME2 NULL,
    startedAt DATETIME2 NULL,
    completedAt DATETIME2 NULL,
    skippedAt DATETIME2 NULL,
    cancelledAt DATETIME2 NULL,
    recallCount INT NOT NULL DEFAULT 0,
    lastRecalledAt DATETIME2 NULL,
    createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_tokens_customer FOREIGN KEY (customerId) REFERENCES dbo.customers(id),
    CONSTRAINT FK_tokens_vehicle FOREIGN KEY (vehicleId) REFERENCES dbo.vehicles(id),
    CONSTRAINT FK_tokens_counter FOREIGN KEY (counterId) REFERENCES dbo.counters(id),
    CONSTRAINT FK_tokens_issuer FOREIGN KEY (issuedBy) REFERENCES dbo.users(id),
    CONSTRAINT FK_tokens_caller FOREIGN KEY (calledBy) REFERENCES dbo.users(id)
  );
  CREATE INDEX IX_tokens_tokenNumber ON dbo.tokens(tokenNumber);
  CREATE INDEX IX_tokens_status ON dbo.tokens(status);
  CREATE INDEX IX_tokens_createdAt ON dbo.tokens(createdAt);
  CREATE INDEX IX_tokens_customerId ON dbo.tokens(customerId);
  CREATE INDEX IX_tokens_vehicleId ON dbo.tokens(vehicleId);
  CREATE INDEX IX_tokens_counterId ON dbo.tokens(counterId);
  CREATE INDEX IX_tokens_business_status ON dbo.tokens(businessDate, status);
END;

IF OBJECT_ID('dbo.token_events', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.token_events (
    id NVARCHAR(64) NOT NULL PRIMARY KEY,
    tokenId NVARCHAR(64) NOT NULL,
    eventType NVARCHAR(32) NOT NULL,
    fromStatus NVARCHAR(32) NULL,
    toStatus NVARCHAR(32) NULL,
    performedBy NVARCHAR(64) NULL,
    reason NVARCHAR(255) NULL,
    metadata NVARCHAR(MAX) NULL,
    createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_token_events_token FOREIGN KEY (tokenId) REFERENCES dbo.tokens(id),
    CONSTRAINT FK_token_events_user FOREIGN KEY (performedBy) REFERENCES dbo.users(id)
  );
  CREATE INDEX IX_token_events_tokenId ON dbo.token_events(tokenId);
  CREATE INDEX IX_token_events_createdAt ON dbo.token_events(createdAt);
END;
