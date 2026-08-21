const sql = require("mssql");
const bcrypt = require("bcryptjs");
const { getSqlConfig } = require("./db-config");

async function upsert(pool, query, inputs = []) {
  const req = pool.request();
  for (const [name, type, value] of inputs) {
    req.input(name, type, value);
  }
  await req.query(query);
}

async function main() {
  const config = getSqlConfig();
  const pool = new sql.ConnectionPool(config);
  await pool.connect();
  const now = new Date();
  const passwordHash = bcrypt.hashSync("demo1234", 10);

  const users = [
    ["user_admin", "admin@indra.local", "System Admin", "ADMIN"],
    ["user_krish", "krish@indra.local", "Krish", "TOKEN_OFFICER"],
    ["user_umesh", "umesh@indra.local", "Umesh", "TOKEN_OFFICER"],
    ["user_imithiyaz", "imithiyaz@indra.local", "Imithiyaz", "TOKEN_OFFICER"],
    ["user_buwaneka", "buwaneka@indra.local", "Buwaneka", "TOKEN_OFFICER"],
    ["user_omith", "omith@indra.local", "Omith", "TOKEN_OFFICER"],
    ["user_token", "token@indra.local", "Token Officer", "TOKEN_OFFICER"],
    ["user_queue", "queue@indra.local", "Queue Officer", "QUEUE_OFFICER"],
  ];

  for (const [id, email, name, role] of users) {
    await upsert(
      pool,
      `MERGE dbo.users AS t
       USING (SELECT @id AS id) AS s ON t.id = s.id
       WHEN MATCHED THEN UPDATE SET email=@email, name=@name, passwordHash=@passwordHash, role=@role, active=1, updatedAt=@now
       WHEN NOT MATCHED THEN INSERT (id,email,name,passwordHash,role,active,createdAt,updatedAt)
       VALUES (@id,@email,@name,@passwordHash,@role,1,@now,@now);`,
      [
        ["id", sql.NVarChar(64), id],
        ["email", sql.NVarChar(191), email],
        ["name", sql.NVarChar(191), name],
        ["passwordHash", sql.NVarChar(255), passwordHash],
        ["role", sql.NVarChar(32), role],
        ["now", sql.DateTime2, now],
      ]
    );
  }

  const counters = [
    ["counter_01", "Counter 01", "1"],
    ["counter_02", "Counter 02", "2"],
  ];
  for (const [id, name, code] of counters) {
    await upsert(
      pool,
      `MERGE dbo.counters AS t
       USING (SELECT @id AS id) AS s ON t.id = s.id
       WHEN MATCHED THEN UPDATE SET name=@name, code=@code, active=1, updatedAt=@now
       WHEN NOT MATCHED THEN INSERT (id,name,code,active,createdAt,updatedAt)
       VALUES (@id,@name,@code,1,@now,@now);`,
      [
        ["id", sql.NVarChar(64), id],
        ["name", sql.NVarChar(100), name],
        ["code", sql.NVarChar(20), code],
        ["now", sql.DateTime2, now],
      ]
    );
  }

  const vehicles = [
    ["veh_raptor", "Ford", "Raptor", null],
    ["veh_vezel", "Honda", "Vezel", null],
    ["veh_taisor", "Toyota", "Taisor", null],
    ["veh_sonet", "Kia", "Sonet", null],
    ["veh_raize", "Toyota", "Raize", null],
    ["veh_dayz", "Nissan", "Dayz", null],
  ];

  await pool.request().query(`
    UPDATE dbo.vehicles
    SET active = 0, updatedAt = SYSUTCDATETIME()
    WHERE id NOT IN (
      'veh_raptor','veh_vezel','veh_taisor','veh_sonet','veh_raize','veh_dayz'
    )
  `);

  for (const [id, brand, model, reg] of vehicles) {
    await upsert(
      pool,
      `MERGE dbo.vehicles AS t
       USING (SELECT @id AS id) AS s ON t.id = s.id
       WHEN MATCHED THEN UPDATE SET brand=@brand, model=@model, registrationNumber=@reg, status='AVAILABLE', active=1, updatedAt=@now
       WHEN NOT MATCHED THEN INSERT (id,brand,model,registrationNumber,status,active,createdAt,updatedAt)
       VALUES (@id,@brand,@model,@reg,'AVAILABLE',1,@now,@now);`,
      [
        ["id", sql.NVarChar(64), id],
        ["brand", sql.NVarChar(100), brand],
        ["model", sql.NVarChar(100), model],
        ["reg", sql.NVarChar(50), reg],
        ["now", sql.DateTime2, now],
      ]
    );
  }

  await upsert(
    pool,
    `MERGE dbo.settings AS t
     USING (SELECT 'settings_default' AS id) AS s ON t.id = s.id
     WHEN MATCHED THEN UPDATE SET
       companyName=@companyName, tokenPrefix='', startingTokenNumber=1, maxTokenNumber=50,
       customerCodePrefix='C', defaultCounterId='counter_01', upcomingTokensCount=6, updatedAt=@now
     WHEN NOT MATCHED THEN INSERT (
       id, companyName, tokenPrefix, startingTokenNumber, maxTokenNumber, customerCodePrefix,
       defaultCounterId, audioNotificationEnabled, textToSpeechEnabled, displayMode, queueBehavior,
       autoCompleteOnNext, upcomingTokensCount, displayShowCustomerName, timezone,
       lastQueueSequence, lastCustomerCodeSequence, updatedAt
     ) VALUES (
       'settings_default', @companyName, '', 1, 50, 'C', 'counter_01', 1, 1, 'LARGE', 'FIFO',
       0, 6, 1, 'Asia/Colombo', 0, 0, @now
     );`,
    [
      ["companyName", sql.NVarChar(191), "Indra Traders (PVT) LTD — Colombo"],
      ["now", sql.DateTime2, now],
    ]
  );

  console.log("Seed complete — Colombo vehicles + officers");
  console.log(
    "Vehicles: Ford Raptor, Honda Vezel, Toyota Taisor, Kia Sonet, Toyota Raize, Nissan Dayz"
  );
  console.log(
    "Officers: Krish, Umesh, Imithiyaz, Buwaneka, Omith (password: demo1234)"
  );
  await pool.close();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
