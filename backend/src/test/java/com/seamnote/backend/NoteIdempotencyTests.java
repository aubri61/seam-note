package com.seamnote.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class NoteIdempotencyTests {
    @LocalServerPort int port;
    @Autowired javax.sql.DataSource dataSource;
    @Autowired JdbcTemplate jdbc;
    final JsonMapper json = JsonMapper.builder().build();
    final HttpClient client = HttpClient.newHttpClient();
    record Reply(int status, JsonNode body) {}
    Reply call(String method, String path, Object body, String key) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api" + path))
            .header("Content-Type", "application/json");
        if (key != null) builder.header("Idempotency-Key", key);
        var request = builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
            : HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build();
        var response = client.send(request, HttpResponse.BodyHandlers.ofString());
        return new Reply(response.statusCode(), response.body().isEmpty() ? null : json.readTree(response.body()));
    }
    String note() throws Exception {
        var folder = call("POST", "/folders", Map.of("name", "idempotency fixture"), null);
        assertEquals(201, folder.status);
        var note = call("POST", "/notes", Map.of("id", UUID.randomUUID().toString(), "folderId", folder.body.get("id").asString(), "title", "before", "content", "before body"), null);
        assertEquals(201, note.status);
        return note.body.get("id").asString();
    }
    Map<String,Object> update(String text, long version) { return Map.of("title", "", "content", text, "expectedVersion", version); }
    long records(String key) { return jdbc.queryForObject("select count(*) from note_update_operations where operation_id=?", Long.class, UUID.fromString(key)); }
    void code(Reply r, String code) { assertEquals(409,r.status);assertEquals(code,r.body.get("code").asString());assertTrue(r.body.get("errors").isArray()); }

    @Test void sameKeyReplaysExactSuccessAcrossPutPatchWithoutIncrement() throws Exception {
        String id=note(), key=UUID.randomUUID().toString();var payload=update("x".repeat(20000)+"\n한글",0);
        var first=call("PUT","/notes/"+id,payload,key);
        var again=call("PATCH","/notes/"+id,payload,key);
        assertEquals(200,first.status);assertEquals(first,again);assertEquals(1,again.body.get("version").asLong());
        assertEquals(first.body,call("GET","/notes/"+id,null,null).body);assertEquals(1,records(key));
    }
    @Test void reusedKeyWithDifferentContentTitleVersionOrNoteIsRejected() throws Exception {
        String id=note(), other=note(),key=UUID.randomUUID().toString();var payload=update("snapshot",0);
        var first=call("PUT","/notes/"+id,payload,key);assertEquals(200,first.status);
        for(var changed:List.of(update("different",0),update("snapshot",1),Map.of("title","different","content","snapshot","expectedVersion",0)))
            code(call("PUT","/notes/"+id,changed,key),"IDEMPOTENCY_KEY_REUSED");
        code(call("PUT","/notes/"+other,payload,key),"IDEMPOTENCY_KEY_REUSED");
        assertEquals(first.body,call("GET","/notes/"+id,null,null).body);
        assertEquals(0,call("GET","/notes/"+other,null,null).body.get("version").asLong());
    }
    @Test void differentKeysStillRespectExpectedVersion() throws Exception {
        String id=note(),a=UUID.randomUUID().toString(),b=UUID.randomUUID().toString();
        var first=call("PUT","/notes/"+id,update("A",0),a);assertEquals(200,first.status);
        code(call("PUT","/notes/"+id,update("B",0),b),"VERSION_CONFLICT");
        assertEquals(0,records(b));assertEquals(first,call("PUT","/notes/"+id,update("A",0),a));
    }
    @Test void invalidKeysReturn400WithoutChangingNote() throws Exception {
        String id=note();var before=call("GET","/notes/"+id,null,null);
        for(String key:List.of("not-a-uuid","1-1-1-1-1",""))
            assertEquals(400,call("PUT","/notes/"+id,update("x",0),key).status);
        assertEquals(before,call("GET","/notes/"+id,null,null));
    }
    @Test void replaySurvivesLaterUpdatesDeletionAndOldRecordAge() throws Exception {
        String id=note(),key=UUID.randomUUID().toString();var payload=update("original result",0);
        var first=call("PUT","/notes/"+id,payload,key);
        assertEquals(200,call("PUT","/notes/"+id,update("later",1),UUID.randomUUID().toString()).status);
        jdbc.update("update note_update_operations set created_at='2000-01-01T00:00:00Z' where operation_id=?",UUID.fromString(key));
        assertEquals(first,call("PUT","/notes/"+id,payload,key));
        assertEquals(2,call("GET","/notes/"+id,null,null).body.get("version").asLong());
        assertEquals(204,call("DELETE","/notes/"+id,null,null).status);
        assertEquals(first,call("PUT","/notes/"+id,payload,key));
        assertEquals(404,call("GET","/notes/"+id,null,null).status);
    }
    @Test void failedLedgerInsertRollsBackNoteUpdateAndAllowsSameKeyRetry() throws Exception {
        String id=note(),key=UUID.randomUUID().toString(),suffix=key.replace("-","");
        var before=call("GET","/notes/"+id,null,null);
        // Test DB only: fail AFTER Note flush, when the success ledger is inserted.
        jdbc.execute("create function reject_"+suffix+"() returns trigger language plpgsql as $$ begin if NEW.operation_id='"+key+"'::uuid then raise exception 'test ledger failure'; end if; return NEW; end $$");
        jdbc.execute("create trigger reject_"+suffix+" before insert on note_update_operations for each row execute function reject_"+suffix+"()");
        try {
            assertEquals(500,call("PUT","/notes/"+id,update("must rollback",0),key).status);
            assertEquals(before,call("GET","/notes/"+id,null,null));assertEquals(0,records(key));
        } finally {
            jdbc.execute("drop trigger reject_"+suffix+" on note_update_operations");jdbc.execute("drop function reject_"+suffix+"()");
        }
        assertEquals(1,call("PUT","/notes/"+id,update("must rollback",0),key).body.get("version").asLong());
    }
    @Test void successResponseLostOnWireReplaysOriginalResult() throws Exception {
        String id=note(),key=UUID.randomUUID().toString();var payload=update("lost response",0);
        byte[] raw=("PUT /api/notes/"+id+" HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nIdempotency-Key: "+key+"\r\nContent-Length: "+json.writeValueAsBytes(payload).length+"\r\n\r\n"+json.writeValueAsString(payload)).getBytes(StandardCharsets.UTF_8);
        try(var proxy=new ServerSocket(0,1,InetAddress.getLoopbackAddress());var executor=Executors.newSingleThreadExecutor()) {
            var forwarded=executor.submit(()->{
                try(var connection=proxy.accept()) {
                    connection.setSoTimeout(10000);assertEquals(raw.length,connection.getInputStream().readNBytes(raw.length).length);
                    // Forward to the real API and commit, then close the downstream socket WITHOUT any response bytes.
                    return call("PUT","/notes/"+id,payload,key);
                }
            });
            try(var downstream=new Socket(InetAddress.getLoopbackAddress(),proxy.getLocalPort())) {
                downstream.setSoTimeout(10000);downstream.getOutputStream().write(raw);downstream.getOutputStream().flush();
                assertEquals(-1,downstream.getInputStream().read(),"No success response reached the caller");
            }
            var committed=forwarded.get(10,TimeUnit.SECONDS);assertEquals(200,committed.status);
            var retry=call("PUT","/notes/"+id,payload,key);assertEquals(committed,retry);
            assertEquals(1,retry.body.get("version").asLong());assertEquals(1,records(key));
        }
    }
    @Test void concurrentSameKeyAppliesOnlyOnce() throws Exception { concurrent(true); }
    @Test void concurrentDifferentKeysHaveOneVersionConflict() throws Exception { concurrent(false); }
    void concurrent(boolean sameKey) throws Exception {
        String id=note(),a=UUID.randomUUID().toString(),b=sameKey?a:UUID.randomUUID().toString();
        try(var blocker=dataSource.getConnection();var observer=dataSource.getConnection();var executor=Executors.newFixedThreadPool(2)) {
            blocker.setAutoCommit(false);
            try(var statement=blocker.prepareStatement("select id from notes where id=? for update")) {
                statement.setObject(1,UUID.fromString(id));try(var rows=statement.executeQuery()){assertTrue(rows.next());}
            }
            var first=executor.submit(()->call("PUT","/notes/"+id,update("same snapshot",0),a));
            var second=executor.submit(()->call("PUT","/notes/"+id,update("same snapshot",0),b));
            boolean waiting=false;
            try {
                long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(10);
                while(System.nanoTime()<deadline) {
                    try(var rows=observer.createStatement().executeQuery("select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and (lower(query) like 'update notes%' or lower(query) like '%pg_advisory_xact_lock%')")) {
                        rows.next();if(rows.getInt(1)>=2){waiting=true;break;}
                    }
                    Thread.sleep(20);
                }
            } finally {blocker.rollback();}
            var x=first.get(10,TimeUnit.SECONDS);var y=second.get(10,TimeUnit.SECONDS);assertTrue(waiting,"Both requests must be in a real DB lock race");
            if(sameKey){assertEquals(200,x.status);assertEquals(x,y);assertEquals(1,records(a));}
            else {
                assertEquals(List.of(200,409),java.util.stream.Stream.of(x.status,y.status).sorted().toList());
                code(x.status==409?x:y,"VERSION_CONFLICT");assertEquals(1,records(a)+records(b));
            }
            assertEquals(1,call("GET","/notes/"+id,null,null).body.get("version").asLong());
        }
    }
}
