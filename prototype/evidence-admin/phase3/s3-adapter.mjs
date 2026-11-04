// Thin AWS SDK v3 command adapter. Dependencies are injected so CI makes zero
// external requests. Real bucket policies and permissions remain deployment gates.
export function createS3PrivateAdapter({s3,PutObjectCommand,DeleteObjectCommand}) {
  if(typeof s3?.send!=='function'||typeof PutObjectCommand!=='function'||
     typeof DeleteObjectCommand!=='function') throw new Error('S3 SDK command contract required');
  return Object.freeze({
    async putPrivateObject({bucket,key,bytes,contentType,acl,sse,kmsKeyRef,metadata}) {
      if(!/^quarantine\/[0-9a-f-]{36}$/.test(key)||!bucket||
         !Buffer.isBuffer(bytes)||contentType!=='application/pdf'||
         acl!=='private'||sse!=='aws:kms'||!kmsKeyRef||
         !/^[a-f0-9]{64}$/.test(metadata?.sha256||'')||
         metadata.classification!=='synthetic-quarantine')
        throw new Error('Unsafe S3 private-object request');
      const result=await s3.send(new PutObjectCommand({
        Bucket:bucket,Key:key,Body:bytes,ContentType:contentType,
        ServerSideEncryption:'aws:kms',SSEKMSKeyId:kmsKeyRef,
        Metadata:metadata
      }));
      if(!result?.ETag) throw new Error('S3 write confirmation missing');
      // Never use ETag as SHA256 integrity evidence. No public-read ACL is sent.
      return {accepted:true};
    },
    async deletePrivateObject({bucket,key}) {
      if(!bucket||!/^quarantine\/[0-9a-f-]{36}$/.test(key))
        throw new Error('Unsafe S3 delete request');
      await s3.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));
      return true;
    }
  });
}
