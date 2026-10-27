package com.seamnote.backend;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.net.*;import java.net.http.*;import java.util.*;import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@ActiveProfiles("test")
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
class CreationIdempotencyTests {
 @LocalServerPort int port;@Autowired JdbcTemplate jdbc;
 final JsonMapper json=JsonMapper.builder().build();final HttpClient client=HttpClient.newHttpClient();
 record Reply(int status,JsonNode body,String key){}
 Reply call(String method,String path,Object body,String key)throws Exception{
  var b=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api"+path)).header("Content-Type","application/json");
  if(key!=null)b.header("Idempotency-Key",key);
  var r=client.send(b.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build(),HttpResponse.BodyHandlers.ofString());
  return new Reply(r.statusCode(),r.body().isEmpty()?null:json.readTree(r.body()),r.headers().firstValue("Idempotency-Key").orElse(null));
 }
 String uuid(){return UUID.randomUUID().toString();}
 long records(String key){return jdbc.queryForObject("select count(*) from creation_operations where operation_id=?",Long.class,UUID.fromString(key));}
 Map<String,Object> folder(String id){return Map.of("id",id,"name","합성 생성 폴더");}
 String parent()throws Exception{var r=call("POST","/folders",folder(uuid()),uuid());assertEquals(201,r.status);return r.body.get("id").asString();}
 @Test void exactFolderReplayAndDifferentPayloadRejection()throws Exception{
  String id=uuid(),key=uuid();var p=folder(id);var first=call("POST","/folders",p,key);
  assertEquals(201,first.status);assertEquals(key,first.key);assertEquals(first,call("POST","/folders",p,key));assertEquals(1,records(key));
  var bad=call("POST","/folders",Map.of("id",id,"name","changed"),key);assertEquals(409,bad.status);assertEquals("IDEMPOTENCY_KEY_REUSED",bad.body.get("code").asString());
 }
 @Test void noteReplayIsOriginalVersionEvenAfterLaterUpdate()throws Exception{
  String id=uuid(),key=uuid();var p=Map.of("id",id,"folderId",parent(),"title","","content","initial");
  var first=call("POST","/notes",p,key);assertEquals(201,first.status);assertEquals(0,first.body.get("version").asLong());
  assertEquals(200,call("PUT","/notes/"+id,Map.of("title","later","content","latest","expectedVersion",0),uuid()).status);
  assertEquals(first,call("POST","/notes",p,key));assertEquals(1,call("GET","/notes/"+id,null,null).body.get("version").asLong());
  assertEquals(409,call("POST","/notes",Map.of("id",id,"folderId",p.get("folderId"),"title","different","content","initial"),uuid()).status);
 }
 @Test void sameKeyConcurrentCreateAppliesOnce()throws Exception{
  String id=uuid(),key=uuid();var p=folder(id);var start=new CountDownLatch(1);
  try(var executor=Executors.newFixedThreadPool(2)){
   var a=executor.submit(()->{start.await();return call("POST","/folders",p,key);});var b=executor.submit(()->{start.await();return call("POST","/folders",p,key);});start.countDown();
   assertEquals(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS));assertEquals(201,a.get().status);assertEquals(1,records(key));
  }
 }
 @Test void sameUuidDifferentKeysCannotOverwrite()throws Exception{
  String id=uuid();assertEquals(201,call("POST","/folders",folder(id),uuid()).status);
  String key=uuid();assertEquals(409,call("POST","/folders",Map.of("id",id,"name","different"),key).status);assertEquals(0,records(key));
  assertEquals("합성 생성 폴더",call("GET","/folders/"+id,null,null).body.get("name").asString());
 }
 @Test void keysCannotCrossCreationAndUpdateLedgers()throws Exception{
  String parent=parent(),id=uuid(),create=uuid();var p=Map.of("id",id,"folderId",parent,"title","","content","");
  assertEquals(201,call("POST","/notes",p,create).status);
  assertEquals(409,call("PUT","/notes/"+id,Map.of("title","x","content","x","expectedVersion",0),create).status);
  assertEquals(409,call("POST","/folders",folder(uuid()),create).status);
  String update=uuid();assertEquals(200,call("PUT","/notes/"+id,Map.of("title","x","content","x","expectedVersion",0),update).status);
  assertEquals(409,call("POST","/folders",folder(uuid()),update).status);
 }
 @Test void parentFailureLeavesNoLedgerAndSameKeyCanRetryAfterParentCreated()throws Exception{
  String id=uuid(),parent=uuid(),key=uuid();var p=Map.of("id",id,"folderId",parent,"title","","content","");
  assertEquals(404,call("POST","/notes",p,key).status);assertEquals(0,records(key));
  assertEquals(201,call("POST","/folders",folder(parent),uuid()).status);assertEquals(201,call("POST","/notes",p,key).status);
 }
 @Test void ledgerInsertFailureRollsBackCreation()throws Exception{
  String id=uuid(),key=uuid(),suffix=key.replace("-","");
  jdbc.execute("create function reject_"+suffix+"() returns trigger language plpgsql as $$ begin if NEW.operation_id='"+key+"'::uuid then raise exception 'creation test failure'; end if; return NEW; end $$");
  jdbc.execute("create trigger reject_"+suffix+" before insert on creation_operations for each row execute function reject_"+suffix+"()");
  try{assertEquals(500,call("POST","/folders",folder(id),key).status);assertEquals(404,call("GET","/folders/"+id,null,null).status);assertEquals(0,records(key));}
  finally{jdbc.execute("drop trigger reject_"+suffix+" on creation_operations");jdbc.execute("drop function reject_"+suffix+"()");}
  assertEquals(201,call("POST","/folders",folder(id),key).status);
 }
 @Test void keyRequiresExplicitClientUuid()throws Exception{assertEquals(400,call("POST","/folders",Map.of("name","x"),uuid()).status);}
}
