package com.seamnote.backend.note.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public class UpdateNoteRequest {


    @NotBlank(message = "제목을 입력해주세요")
    @Size(max=200, message = "200자 이하로 입력해주세요.")
    private String title;

    @NotNull(message = "본문은 null일 수 없습니다.")
    private String content;


    public UpdateNoteRequest() {}

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }




}
