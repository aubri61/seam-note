package com.seamnote.backend;
import com.seamnote.backend.auth.token.AccessTokenIssuer;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.net.*;
import java.net.http.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@ActiveProfiles("test")
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
class OwnershipApiTests {
    @LocalServerPort int port; @Autowired JdbcTemplate jdbc; @Autowired AccessTokenIssuer tokens;
    final HttpClient http=HttpClient.newHttpClient();final JsonMapper json=JsonMapper.builder().build();
    TestAccounts.Account a,b;
    @BeforeEach void accounts(){a=TestAccounts.create(jdbc,tokens);b=TestAccounts.create(jdbc,tokens);}
    record Reply(int status,JsonNode body){}
    Reply call(TestAccounts.Account actor,String method,String path,Object data,String key)throws Exception{
        var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api"+path)).header("Content-Type","application/json");
        if(actor!=null)request.header("Authorization","Bearer "+actor.token());if(key!=null)request.header("Idempotency-Key",key);
        var r=http.send(request.method(method,data==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(data))).build(),HttpResponse.BodyHandlers.ofString());
        return new Reply(r.statusCode(),r.body().isEmpty()?null:json.readTree(r.body()));
    }
    String folder(TestAccounts.Account actor,String parent)throws Exception{
        var body=new HashMap<String,Object>();body.put("name","개인 폴더");if(parent!=null)body.put("parentId",parent);
        var r=call(actor,"POST","/folders",body,null);assertEquals(201,r.status());return r.body().get("id").asString();
    }
    String note(TestAccounts.Account actor,String folder)throws Exception{
        var body=new HashMap<String,Object>();body.put("title","개인 원고");body.put("content",TiptapFixtures.doc("비공개"));if(folder!=null)body.put("folderId",folder);
        var r=call(actor,"POST","/notes",body,null);assertEquals(201,r.status());return r.body().get("id").asString();
    }
    Map<String,Object> update(){return Map.of("title","수정","content",TiptapFixtures.doc("수정"),"expectedVersion",0);}
    @Test void anonymousAndOtherOwnerCannotReadWriteMoveOrDelete()throws Exception{
        var fa=folder(a,null);var fb=folder(b,null);var na=note(a,fa);
        for(String path:List.of("/notes","/notes/"+na,"/folders","/folders/"+fa,"/workspace/tree"))assertEquals(401,call(null,"GET",path,null,null).status());
        for(String path:List.of("/notes/"+na,"/folders/"+fa,"/folders/"+fa+"/children","/folders/"+fa+"/notes"))assertEquals(404,call(b,"GET",path,null,null).status(),path);
        assertEquals(404,call(b,"PUT","/notes/"+na,update(),UUID.randomUUID().toString()).status());
        assertEquals(404,call(b,"PATCH","/folders/"+fa,Map.of("name","수정"),null).status());
        assertEquals(404,call(b,"DELETE","/notes/"+na,null,null).status());assertEquals(404,call(b,"DELETE","/folders/"+fa,null,null).status());
        assertEquals(404,call(a,"PATCH","/notes/"+na+"/move",Map.of("targetFolderId",fb),null).status());
        assertEquals(404,call(a,"PATCH","/folders/"+fa+"/move",Map.of("targetParentId",fb),null).status());
        assertEquals(404,call(b,"POST","/notes",Map.of("title","","content",TiptapFixtures.doc(""),"folderId",fa),null).status());
        assertEquals(404,call(b,"POST","/folders",Map.of("name","침입","parentId",fa),null).status());
        assertEquals(200,call(a,"GET","/notes/"+na,null,null).status());
    }
    @Test void listsTreesAndRootOrdersArePerOwner()throws Exception{
        var fa=folder(a,null);var fb=folder(b,null);note(a,null);note(b,null);note(a,fa);
        assertEquals(0,call(a,"GET","/folders/"+fa,null,null).body().get("sortOrder").asInt());
        assertEquals(0,call(b,"GET","/folders/"+fb,null,null).body().get("sortOrder").asInt());
        assertEquals(1,call(b,"GET","/folders",null,null).body().size());assertEquals(1,call(b,"GET","/notes",null,null).body().size());
        var tree=call(b,"GET","/workspace/tree",null,null).body();assertEquals(1,tree.get("folders").size());assertEquals(1,tree.get("notes").size());
        assertEquals(204,call(a,"DELETE","/folders/"+fa,null,null).status());assertEquals(200,call(b,"GET","/folders/"+fb,null,null).status());
    }
    @Test void sameKeyIsIndependentAcrossUsersAndNeverLeaksReplay()throws Exception{
        String key=UUID.randomUUID().toString(),id=UUID.randomUUID().toString();
        var create=Map.of("id",id,"title","A 전용","content",TiptapFixtures.doc("A 전용"));
        var first=call(a,"POST","/notes",create,key);assertEquals(201,first.status());
        assertEquals(409,call(b,"POST","/notes",create,key).status()); // Global entity UUID collision, no replay body.
        var own=call(b,"POST","/notes",Map.of("id",UUID.randomUUID().toString(),"title","B 전용","content",TiptapFixtures.doc("B")),key);
        assertEquals(201,own.status());assertEquals("B 전용",own.body().get("title").asString());
        String updateKey=UUID.randomUUID().toString();var changed=call(a,"PUT","/notes/"+id,update(),updateKey);assertEquals(200,changed.status());
        assertEquals(404,call(b,"PUT","/notes/"+id,update(),updateKey).status());
        assertEquals(204,call(a,"DELETE","/notes/"+id,null,null).status());
        assertEquals(changed,call(a,"PUT","/notes/"+id,update(),updateKey));assertEquals(first,call(a,"POST","/notes",create,key));
    }
    @Test void databaseRejectsCrossOwnerRelationsAndLegacyAccountIsDisabled()throws Exception{
        var fa=UUID.fromString(folder(a,null));var nb=UUID.fromString(note(b,null));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->jdbc.update("update notes set folder_id=? where id=?",fa,nb));
        var fb=UUID.fromString(folder(b,null));
        assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->jdbc.update("update folders set parent_id=? where id=?",fa,fb));
        assertFalse(jdbc.queryForObject("select enabled from app_users where id='00000000-0000-4000-8000-000000000000'",Boolean.class));
    }
}
