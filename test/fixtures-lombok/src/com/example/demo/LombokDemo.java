package com.example.demo;

import lombok.AccessLevel;
import lombok.Builder;
import lombok.Data;
import lombok.Setter;

@Data
@Builder
public class LombokDemo {

    private String name;

    private int cacheSize;

    @Setter(AccessLevel.NONE)
    private String frozen;

    public String hello(String who) {
        return name + who;
    }
}
