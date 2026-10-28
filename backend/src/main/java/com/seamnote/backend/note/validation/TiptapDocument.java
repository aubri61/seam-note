package com.seamnote.backend.note.validation;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import java.lang.annotation.*;
import java.util.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = TiptapDocument.Validator.class)
public @interface TiptapDocument {
    String message() default "본문은 지원되는 Tiptap JSON 문서여야 합니다.";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
    class Validator implements ConstraintValidator<TiptapDocument, String> {
        private static final JsonMapper JSON = JsonMapper.builder().enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
        private static final Set<String> BLOCKS = Set.of("paragraph", "bulletList", "orderedList");
        @Override public boolean isValid(String value, ConstraintValidatorContext context) {
            if (value == null) return true; // @NotNull owns the missing-field contract.
            try { return visit(JSON.readTree(value), 0, new int[]{0}); } catch (Exception error) { return false; }
        }
        private boolean visit(JsonNode node, int depth, int[] count) {
            if (node == null || !node.isObject() || depth > 64 || ++count[0] > 100_000
                || !Set.of("type","text","attrs","marks","content").containsAll(node.propertyNames()) || !node.path("type").isString()) return false;
            String type = node.get("type").asString();
            if (!Set.of("doc","paragraph","text","hardBreak","bulletList","orderedList","listItem").contains(type)
                || (depth == 0) != type.equals("doc")) return false;
            if (type.equals("text") ? !node.path("text").isString() || node.get("text").asString().isEmpty() : node.has("text")) return false;
            if (node.has("attrs")) {
                var attrs = node.get("attrs");
                if (!type.equals("orderedList") || !attrs.isObject() || !Set.of("start","type").containsAll(attrs.propertyNames())) return false;
                if (attrs.has("start") && (!attrs.get("start").isIntegralNumber() || attrs.get("start").asLong() < 1 || attrs.get("start").asLong() > 9007199254740991L)) return false;
                if (attrs.has("type") && !attrs.get("type").isNull() && (!attrs.get("type").isString() || !Set.of("1","a","A","i","I").contains(attrs.get("type").asString()))) return false;
            }
            if (node.has("marks")) {
                var marks = node.get("marks"); var names = new HashSet<String>();
                if (!Set.of("text","hardBreak").contains(type) || !marks.isArray()) return false;
                for (var mark : marks.valueStream().toList()) {
                    if (!mark.isObject() || mark.size() != 1 || !mark.path("type").isString() || !Set.of("bold","italic").contains(mark.get("type").asString()) || !names.add(mark.get("type").asString())) return false;
                }
            }
            if (node.has("content") && !node.get("content").isArray()) return false;
            var children = node.has("content") ? node.get("content").valueStream().toList() : List.<JsonNode>of();
            if (Set.of("text","hardBreak").contains(type) && !children.isEmpty()) return false;
            if (Set.of("doc","listItem","bulletList","orderedList").contains(type) && children.isEmpty()) return false;
            if (type.equals("listItem") && !children.getFirst().path("type").asString().equals("paragraph")) return false;
            for (var child : children) {
                String childType = child.path("type").asString();
                if (!visit(child,depth+1,count) || switch(type) {
                    case "doc", "listItem" -> !BLOCKS.contains(childType);
                    case "paragraph" -> !Set.of("text","hardBreak").contains(childType);
                    case "bulletList", "orderedList" -> !childType.equals("listItem");
                    default -> true;
                }) return false;
            }
            return true;
        }
    }
}
