-- Store ride dates as YYYY-MM-DD strings (avoids UTC @db.Date equality bugs in search)
ALTER TABLE "zippycar"."rides"
  ALTER COLUMN "date" TYPE VARCHAR(10)
  USING to_char("date", 'YYYY-MM-DD');
