package com.seamnote.backend;

import org.junit.jupiter.api.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.net.URI;
import java.net.http.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;

@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FolderNoteApiTests {
    @LocalServerPort int port;
    @org.springframework.beans.factory.annotation.Autowired javax.sql.DataSource dataSource;
    final HttpClient client = HttpClient.newHttpClient();
    final JsonMapper mapper = JsonMapper.builder().build();
    record Reply(int status, JsonNode body, String location) {}
    Reply call(String method, String path, Object body) throws Exception {
        String json = body instanceof String text ? text : mapper.writeValueAsString(body);
        var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api" + path))
            .header("Content-Type", "application/json")
            .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(json)).build();
        var response = client.send(request, HttpResponse.BodyHandlers.ofString());
        return new Reply(response.statusCode(), response.body().isEmpty() ? null : mapper.readTree(response.body()), response.headers().firstValue("Location").orElse(null));
    }
    String folder(String parent) throws Exception {
        var body = new HashMap<String,Object>(); body.put("name", "  새 폴더  "); body.put("id", UUID.randomUUID().toString());
        if (parent != null) body.put("parentId", parent);
        var r = call("POST", "/folders", body);
        assertEquals(201, r.status, String.valueOf(r.body)); assertEquals("새 폴더", r.body.get("name").asString());
        assertEquals("/api/folders/" + r.body.get("id").asString(), r.location);
        return r.body.get("id").asString();
    }
    String note(String folder, String title, String content) throws Exception {
        String id = UUID.randomUUID().toString();
        var r = call("POST", "/notes", Map.of("id", id, "folderId", folder, "title", title, "content", TiptapFixtures.doc(content)));
        assertEquals(201, r.status, String.valueOf(r.body)); assertEquals(id, r.body.get("id").asString());
        assertEquals(title, r.body.get("title").asString()); assertEquals(TiptapFixtures.doc(content), r.body.get("content").asString());
        assertEquals(folder, r.body.get("folderId").asString()); assertEquals(0, r.body.get("version").asInt());
        assertEquals("/api/notes/" + id, r.location); return id;
    }
    void error(String method, String path, Object body, int status, String code) throws Exception {
        var r = call(method, path, body); assertEquals(status,r.status,String.valueOf(r.body));
        assertEquals(code,r.body.get("code").asString()); assertTrue(r.body.get("errors").isArray());
    }
    @Test void folderLifecycleAndCycleValidation() throws Exception {
        String a=folder(null), b=folder(a), c=folder(b);
        var roots=call("GET","/folders?parentId=root",null); assertEquals(200,roots.status);
        assertTrue(roots.body.valueStream().anyMatch(x -> x.get("id").asString().equals(a)));
        var children=call("GET","/folders/"+a+"/children",null);
        assertEquals(1,children.body.size()); assertEquals(b,children.body.get(0).get("id").asString());
        assertEquals(1,call("GET","/folders?parentId="+a,null).body.size());
        error("PATCH","/folders/"+a+"/move",Map.of("targetParentId",a),409,"FOLDER_CYCLE_DETECTED");
        error("PATCH","/folders/"+a+"/move",Map.of("targetParentId",c),409,"FOLDER_CYCLE_DETECTED");
        error("DELETE","/folders/"+a,null,409,"FOLDER_NOT_EMPTY");
        assertEquals(200,call("PATCH","/folders/"+c,Map.of("name","  renamed  ")).status);
        assertEquals("renamed",call("GET","/folders/"+c,null).body.get("name").asString());
        assertEquals(200,call("PATCH","/folders/"+c+"/move","{\"targetParentId\":null}").status);
        assertTrue(call("GET","/folders/"+c,null).body.get("parentId").isNull());
        assertEquals(204,call("DELETE","/folders/"+c,null).status);
        assertEquals(204,call("DELETE","/folders/"+b,null).status);
        assertEquals(204,call("DELETE","/folders/"+a,null).status);
    }
    @Test void folderInputAndDuplicates() throws Exception {
        for(String body:List.of("{}","{\"name\":null}","{\"name\":\"\"}","{\"name\":\"   \"}"))
            error("POST","/folders",body,400,"INVALID_REQUEST");
        error("POST","/folders",Map.of("name","x".repeat(201)),400,"INVALID_REQUEST");
        var valid=call("POST","/folders",Map.of("name","x".repeat(200))); assertEquals(201,valid.status);
        String id=folder(null);
        error("POST","/folders",Map.of("id",id,"name","duplicate"),409,"DUPLICATE_ENTITY_ID");
        error("POST","/folders",Map.of("parentId",UUID.randomUUID().toString(),"name","x"),404,"FOLDER_NOT_FOUND");
        error("PATCH","/folders/"+id,Map.of("name","  "),400,"INVALID_REQUEST");
        error("PATCH","/folders/"+id+"/move",Map.of(),400,"INVALID_REQUEST");
        error("PATCH","/folders/"+id+"/move",Map.of("targetParentId",UUID.randomUUID().toString()),404,"FOLDER_NOT_FOUND");
    }
    @Test void noteLifecycleBlanksSummariesAndOrdering() throws Exception {
        String a=folder(null),b=folder(null);
        String id=note(a,"","");
        note(a,"", "body"); note(a,"title", ""); note(a,"x".repeat(200), "long body");
        var summaries=call("GET","/folders/"+a+"/notes",null);
        assertEquals(4,summaries.body.size());
        for(int i=0;i<4;i++){ assertFalse(summaries.body.get(i).has("content")); assertEquals(i,summaries.body.get(i).get("sortOrder").asInt()); }
        assertEquals(200,call("PUT","/notes/"+id,Map.of("title","changed","content",TiptapFixtures.doc("new body"),"expectedVersion",0)).status);
        var changed=call("PATCH","/notes/"+id,Map.of("title","", "content",TiptapFixtures.doc(""),"expectedVersion",1));
        assertEquals(200,changed.status); assertEquals("",changed.body.get("title").asString());
        assertTrue(changed.body.get("version").asInt()>0);
        assertEquals(id,call("GET","/folders/"+a+"/notes",null).body.get(0).get("id").asString());
        error("DELETE","/folders/"+a,null,409,"FOLDER_NOT_EMPTY");
        assertEquals(b,call("PATCH","/notes/"+id+"/move",Map.of("targetFolderId",b)).body.get("folderId").asString());
        assertEquals(1,call("GET","/folders/"+b+"/notes",null).body.size());
        assertTrue(call("GET","/notes",null).body.valueStream().anyMatch(x->x.get("id").asString().equals(id)&&x.has("content")));
        assertEquals(204,call("DELETE","/notes/"+id,null).status);
        error("GET","/notes/"+id,null,404,"NOTE_NOT_FOUND");
    }
    @Test void noteValidationErrorsAndDuplicatePreservation() throws Exception {
        String a=folder(null), id=note(a,"original","body");
        error("POST","/notes",Map.of("id",id,"folderId",a,"title","overwrite","content",TiptapFixtures.doc("")),409,"DUPLICATE_ENTITY_ID");
        assertEquals("original",call("GET","/notes/"+id,null).body.get("title").asString());
        error("POST","/notes",Map.of("folderId",a,"title","x".repeat(201),"content",TiptapFixtures.doc("")),400,"INVALID_REQUEST");
        for(String body:List.of("{}","{\"title\":null,\"content\":\"\"}","{\"title\":\"\"}","{\"title\":\"\",\"content\":null}")){
            error("POST","/notes",body,400,"INVALID_REQUEST"); error("PATCH","/notes/"+id,body,400,"INVALID_REQUEST");
        }
        for(String body:List.of(
            "{\"folderId\":\""+a+"\",\"content\":\"\"}",
            "{\"folderId\":\""+a+"\",\"title\":null,\"content\":\"\"}",
            "{\"folderId\":\""+a+"\",\"title\":\"\"}",
            "{\"folderId\":\""+a+"\",\"title\":\"\",\"content\":null}"))
            error("POST","/notes",body,400,"INVALID_REQUEST");
        error("PUT","/notes/"+id,Map.of("title","x".repeat(201),"content",TiptapFixtures.doc(""),"expectedVersion",0),400,"INVALID_REQUEST");
        error("POST","/notes",Map.of("folderId",UUID.randomUUID().toString(),"title","","content",TiptapFixtures.doc("")),404,"FOLDER_NOT_FOUND");
        error("PATCH","/notes/"+id+"/move",Map.of("targetFolderId",UUID.randomUUID().toString()),404,"FOLDER_NOT_FOUND");
        error("PATCH","/notes/"+id+"/move","{\"targetFolderId\":null}",400,"INVALID_REQUEST");
        error("GET","/notes/not-a-uuid",null,400,"INVALID_REQUEST");
        error("GET","/folders?parentId=invalid",null,400,"INVALID_REQUEST");
        error("POST","/notes","{",400,"MALFORMED_JSON");
        error("POST","/notes",Map.of("id","invalid","folderId",a,"title","","content",TiptapFixtures.doc("")),400,"MALFORMED_JSON");
        error("GET","/folders/"+UUID.randomUUID(),null,404,"FOLDER_NOT_FOUND");
        error("GET","/folders/"+UUID.randomUUID()+"/notes",null,404,"FOLDER_NOT_FOUND");
    }
    @Test void concurrentMovesCannotCreateCycle() throws Exception {
        String a=folder(null),b=folder(null);
        var ready=new CountDownLatch(2); var start=new CountDownLatch(1);
        try(var executor=Executors.newFixedThreadPool(2)) {
            var first=executor.submit(()->{ready.countDown();start.await();return call("PATCH","/folders/"+a+"/move",Map.of("targetParentId",b));});
            var second=executor.submit(()->{ready.countDown();start.await();return call("PATCH","/folders/"+b+"/move",Map.of("targetParentId",a));});
            assertTrue(ready.await(5,TimeUnit.SECONDS)); start.countDown();
            assertEquals(Set.of(200,409),Set.of(first.get(10,TimeUnit.SECONDS).status,second.get(10,TimeUnit.SECONDS).status));
        }
        var pa=call("GET","/folders/"+a,null).body.get("parentId");
        var pb=call("GET","/folders/"+b,null).body.get("parentId");
        assertTrue(pa.isNull() || pb.isNull());
    }
    @Test void concurrentAppendsHaveDistinctOrders() throws Exception {
        String a=folder(null);
        try(var executor=Executors.newFixedThreadPool(4)) {
            List<Future<Reply>> tasks=new ArrayList<>();
            for(int i=0;i<8;i++)tasks.add(executor.submit(()->call("POST","/notes",Map.of("folderId",a,"title","","content",TiptapFixtures.doc("")))));
            for(var task:tasks)assertEquals(201,task.get(15,TimeUnit.SECONDS).status);
        }
        var list=call("GET","/folders/"+a+"/notes",null).body;
        assertEquals(8,list.size());
        for(int i=0;i<8;i++)assertEquals(i,list.get(i).get("sortOrder").asInt());
    }
    @Test void consecutiveContentUpdatesReturnIncrementedVersions() throws Exception {
        String id = note(folder(null), "initial", "initial body");
        var first = call("PUT", "/notes/" + id,
            Map.of("title", "1화", "content", TiptapFixtures.doc("수정한 원고 내용"), "expectedVersion", 0));
        assertEquals(200, first.status, String.valueOf(first.body));
        assertEquals(1, first.body.get("version").asLong());
        assertEquals("1화", first.body.get("title").asString());
        assertEquals(TiptapFixtures.doc("수정한 원고 내용"), first.body.get("content").asString());
        var second = call("PATCH", "/notes/" + id,
            Map.of("title", "", "content", TiptapFixtures.doc(""), "expectedVersion", 1));
        assertEquals(200, second.status, String.valueOf(second.body));
        assertEquals(2, second.body.get("version").asLong());
        assertEquals("", second.body.get("title").asString());
        assertEquals(TiptapFixtures.doc(""), second.body.get("content").asString());
        assertEquals(second.body, call("GET", "/notes/" + id, null).body);
    }

    @Test void staleExpectedVersionPreservesServerNote() throws Exception {
        String id = note(folder(null), "initial", "initial body");
        var latest = call("PUT", "/notes/" + id,
            Map.of("title", "server title", "content", TiptapFixtures.doc("server body"), "expectedVersion", 0));
        assertEquals(200, latest.status);
        for (String method : List.of("PUT", "PATCH")) {
            error(method, "/notes/" + id,
                Map.of("title", "offline title", "content", TiptapFixtures.doc("offline body"), "expectedVersion", 0),
                409, "VERSION_CONFLICT");
            assertEquals(latest.body, call("GET", "/notes/" + id, null).body,
                "Stale request must preserve title, content, timestamps and version");
        }
    }

    @Test void invalidExpectedVersionsAreRejectedWithoutMutation() throws Exception {
        String id = note(folder(null), "server title", "server body");
        var before = call("GET", "/notes/" + id, null).body;
        for (String method : List.of("PUT", "PATCH")) {
            for (String json : List.of(
                "{\"title\":\"changed\",\"content\":"+mapper.writeValueAsString(TiptapFixtures.doc("changed"))+"}",
                "{\"title\":\"changed\",\"content\":"+mapper.writeValueAsString(TiptapFixtures.doc("changed"))+",\"expectedVersion\":null}",
                "{\"title\":\"changed\",\"content\":"+mapper.writeValueAsString(TiptapFixtures.doc("changed"))+",\"expectedVersion\":-1}")) {
                var result = call(method, "/notes/" + id, json);
                assertEquals(400, result.status, String.valueOf(result.body));
                assertEquals("INVALID_REQUEST", result.body.get("code").asString());
                assertTrue(result.body.get("errors").valueStream()
                    .anyMatch(e -> e.get("field").asString().equals("expectedVersion")));
                assertEquals(before, call("GET", "/notes/" + id, null).body);
            }
            // Content replacement still requires both fields with a valid version.
            for (String json : List.of(
                "{\"content\":\"\",\"expectedVersion\":0}",
                "{\"title\":null,\"content\":\"\",\"expectedVersion\":0}",
                "{\"title\":\"\",\"expectedVersion\":0}",
                "{\"title\":\"\",\"content\":null,\"expectedVersion\":0}")) {
                error(method, "/notes/" + id, json, 400, "INVALID_REQUEST");
            }
        }
        assertEquals(before, call("GET", "/notes/" + id, null).body);
    }

    @Test void concurrentContentWriteReturnsVersionConflict() throws Exception {
        String id = note(folder(null), "old", "old body");
        try (var blocker = dataSource.getConnection();
             var observer = dataSource.getConnection();
             var executor = Executors.newFixedThreadPool(2)) {
            blocker.setAutoCommit(false);
            try (var statement = blocker.prepareStatement("select id from notes where id=? for update")) {
                statement.setObject(1, UUID.fromString(id));
                try (var rows = statement.executeQuery()) { assertTrue(rows.next()); }
            }
            var first = executor.submit(() -> call("PUT", "/notes/" + id,
                Map.of("title", "first title", "content", TiptapFixtures.doc("first body"), "expectedVersion", 0)));
            var second = executor.submit(() -> call("PATCH", "/notes/" + id,
                Map.of("title", "second title", "content", TiptapFixtures.doc("second body"), "expectedVersion", 0)));
            boolean bothWaiting = false;
            try {
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
                while (System.nanoTime() < deadline) {
                    try (var statement = observer.createStatement();
                         var rows = statement.executeQuery("select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and lower(query) like 'update notes%'")) {
                        rows.next();
                        if (rows.getInt(1) >= 2) { bothWaiting = true; break; }
                    }
                    Thread.sleep(20);
                }
            } finally {
                // Release only our row lock: no test SQL changes content or version.
                blocker.rollback();
            }
            var a = first.get(10, TimeUnit.SECONDS);
            var b = second.get(10, TimeUnit.SECONDS);
            assertTrue(bothWaiting, "Both requests must pass the application check before the DB race");
            assertEquals(List.of(200, 409), java.util.stream.Stream.of(a.status, b.status).sorted().toList());
            var winner = a.status == 200 ? a : b;
            var loser = a.status == 409 ? a : b;
            assertEquals(1, winner.body.get("version").asLong());
            assertEquals("VERSION_CONFLICT", loser.body.get("code").asString());
            assertTrue(loser.body.get("errors").isArray());
            assertEquals(winner.body, call("GET", "/notes/" + id, null).body);
        }
    }

    @Test void tiptapJsonContractRejectsInvalidContentWithoutChangingNote() throws Exception {
        String parent=folder(null), id=note(parent,"rich", "기준 원고");
        var before=call("GET","/notes/"+id,null).body;
        for(String invalid:List.of("", "plain text", "null", "{}", "{\"type\":\"doc\",\"content\":[]}",
            "{\"type\":\"doc\",\"content\":[{\"type\":\"image\"}]}")) {
            var body=Map.of("title","bad","content",invalid,"expectedVersion",0);
            assertEquals(400,call("PUT","/notes/"+id,body).status);
            assertEquals(400,call("POST","/notes",Map.of("folderId",parent,"title","bad","content",invalid)).status);
            assertEquals(before,call("GET","/notes/"+id,null).body);
        }
        String rich="{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"한글\",\"marks\":[{\"type\":\"bold\"},{\"type\":\"italic\"}]},{\"type\":\"hardBreak\"}]},{\"type\":\"orderedList\",\"attrs\":{\"start\":2,\"type\":null},\"content\":[{\"type\":\"listItem\",\"content\":[{\"type\":\"paragraph\"}]}]}]}";
        var saved=call("PUT","/notes/"+id,Map.of("title","rich","content",rich,"expectedVersion",0));
        assertEquals(200,saved.status,String.valueOf(saved.body));
        assertEquals(rich,saved.body.get("content").asString());assertEquals(1,saved.body.get("version").asLong());
    }
}
