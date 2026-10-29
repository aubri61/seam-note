package com.seamnote.backend;
import java.util.*;
import tools.jackson.databind.json.JsonMapper;
final class TiptapFixtures {
 static String doc(String text) {
  var paragraph=text.isEmpty()?Map.of("type","paragraph"):Map.of("type","paragraph","content",List.of(Map.of("type","text","text",text)));
  return JsonMapper.builder().build().writeValueAsString(Map.of("type","doc","content",List.of(paragraph)));
 }
}
