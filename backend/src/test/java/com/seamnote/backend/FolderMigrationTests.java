package com.seamnote.backend;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import java.sql.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class FolderMigrationTests {
    String url=Objects.requireNonNull(System.getenv("TEST_DB_URL"),"TEST_DB_URL must name an isolated test database");
    String user=System.getenv().getOrDefault("TEST_DB_USERNAME","postgres");
    String password=System.getenv().getOrDefault("TEST_DB_PASSWORD","");
    Flyway flyway(String schema, String target) {
        return Flyway.configure().dataSource(url,user,password).schemas(schema).defaultSchema(schema).target(target).load();
    }
    List<List<Object>> snapshot(Connection c) throws Exception {
        var rows=new ArrayList<List<Object>>();
        try(var r=c.createStatement().executeQuery("select id,title,content,created_at,updated_at from notes order by id")) {
            while(r.next())rows.add(List.of(r.getObject(1),r.getString(2),r.getString(3),r.getTimestamp(4).toInstant(),r.getTimestamp(5).toInstant()));
        }
        return rows;
    }
    @Test void migratesEmptyV1() throws Exception { verify(false); }
    @Test void preservesEveryLegacyField() throws Exception { verify(true); }
    void verify(boolean populated) throws Exception {
        String schema="migration_"+UUID.randomUUID().toString().replace("-","");
        flyway(schema,"1").migrate();
        try(var c=DriverManager.getConnection(url,user,password)) {
            c.setSchema(schema);
            if(populated) {
                try(var statement=c.prepareStatement("insert into notes values (?, ?, ?, '2020-01-02T03:04:05.123456Z', '2021-02-03T04:05:06.654321Z')")) {
                    for(int i=0;i<3;i++){ statement.setObject(1,UUID.randomUUID());statement.setString(2,i==0?"":"기존 원고 "+i);statement.setString(3,i==0?"":"본문\n한글 ' "+"x".repeat(10000));statement.executeUpdate(); }
                }
            }
            var before=snapshot(c);
            flyway(schema,"latest").migrate();
            assertEquals(before,snapshot(c));
            try(var r=c.createStatement().executeQuery("select count(*) from notes n left join folders f on f.id=n.folder_id where f.id is null")){r.next();assertEquals(0,r.getInt(1));}
            try(var r=c.createStatement().executeQuery("select count(*) from folders")){r.next();assertEquals(populated?1:0,r.getInt(1));}
            try(var r=c.createStatement().executeQuery("select count(*) from notes where version<>0 or sort_order is null")){r.next();assertEquals(0,r.getInt(1));}
            if(populated){
                assertThrows(SQLException.class,()->c.createStatement().executeUpdate("update notes set folder_id='00000000-0000-0000-0000-000000000000'"));
                assertThrows(SQLException.class,()->c.createStatement().executeUpdate("update notes set sort_order=0"));
                c.createStatement().executeUpdate("update notes set folder_id=null where sort_order=0");
                c.createStatement().executeUpdate("delete from folders");
                try(var rows=c.createStatement().executeQuery("select count(*) from notes")){rows.next();assertEquals(1,rows.getInt(1),"Unfiled note survives folder cascade");}
            }
            assertEquals(0,flyway(schema,"latest").migrate().migrationsExecuted);
        }
    }
}
