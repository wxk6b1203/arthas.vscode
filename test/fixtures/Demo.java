package com.example.demo;

import java.util.List;
import java.util.Map;

@org.springframework.stereotype.Component("demoService")
public class Demo {

    private static final String TAG = "DEMO_TAG";

    private static final boolean ENABLED = true;

    private int count;

    private String name;

    public Demo() {
        this.count = 0;
    }

    public int getCount() {
        return count;
    }

    public void setCount(int count) {
        this.count = count;
    }

    public static String staticHello(String word, int times) {
        return word + times;
    }

    public String hello(String who, List<String> words, Map<String, Integer> mapping) {
        Runnable r = new Runnable() {
            @Override
            public void run() {
                System.out.println("anon");
            }
        };
        innerHelp();
        return "hi " + who;
    }

    private void innerHelp() {
        if (count > 0) {
            count--;
        }
    }

    class InnerTask {
        private boolean running;

        public void run() {
        }
    }

    static class StaticInner {
        public static void go() {
        }
    }

    public enum Color {
        RED, GREEN, BLUE;

        public String lower() {
            return name().toLowerCase();
        }
    }
}
