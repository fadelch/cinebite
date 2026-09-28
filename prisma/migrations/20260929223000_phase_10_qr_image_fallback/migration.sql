-- Firebase Storage is preferred, but a protected PostgreSQL binary fallback
-- keeps QR operations available when a project's bucket has not been provisioned.
ALTER TABLE "seat_qr_codes" ADD COLUMN "qrImageData" BYTEA;
