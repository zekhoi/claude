# Design: customer document uploads

## Goal

Customers upload invoices and ID documents (PDF, JPEG, PNG, up to 50 MB) so support staff can review them.

## Flow

1. The browser calls `POST /api/uploads` with `{ filename, contentType }`. The API returns a presigned S3 PUT URL for the key `uploads/{filename}` in the bucket `acme-customer-docs`, valid for 24 hours.
2. The browser uploads the file directly to S3.
3. The browser calls `POST /api/uploads/complete` with `{ key, customerId }`. The API stores a row `(customerId, key, uploadedAt)`.
4. Support staff open `GET /api/uploads/{key}` in the admin panel, which redirects to a presigned GET URL. Staff can also share a document link with a customer by copying that URL into an email.
5. A nightly job generates thumbnails of every new file with ImageMagick.

## Notes

- The bucket has public read access disabled. Objects are not encrypted with a customer-managed key.
- `customerId` in step 3 comes from the request body because the upload page is also used by staff on behalf of customers.
- There is no virus scanning yet.
