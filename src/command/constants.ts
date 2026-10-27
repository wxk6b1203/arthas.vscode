/**
 * 大常量：逐字移植自 arthas-idea-plugin ArthasCommandConstants。
 */

/** 获取所有 map source 配置的 OGNL（vmtool/ognl 全量 Spring 配置用） */
export const SPRING_ALL_MAP_PROPERTY =
  '#allProperties={},#propertySourceIterator=#standardServletEnvironment.getPropertySources().iterator(),' +
  '#propertySourceIterator.{#key=#this.getName(),#allProperties.add("                "),' +
  '#allProperties.add("------------------------- name:"+#key),' +
  '#this.getSource() instanceof java.util.Map ?#this.getSource().entrySet().iterator.' +
  '{#key=#this.key,#value=#this.getValue(),#allProperties.add(#key+"="+#value)}:#{}},#allProperties';

/** ognl 获取 spring 所有环境变量：String.format(SPRING_ALL_PROPERTY, depth, springContextPrefix) */
export const SPRING_ALL_PROPERTY =
  "ognl -x %s '%s,#standardServletEnvironment=#springContext.getEnvironment(),+" + SPRING_ALL_MAP_PROPERTY + "'";

/** ognl 获取选中的 spring 配置：String.format(depth, springContextPrefix, key) */
export const SPRING_ENVIRONMENT_PROPERTY =
  "ognl -x %s '%s,#springContext.getEnvironment().getProperty(\"%s\")'";

/** 安装脚本：arthas-boot alias as.sh */
export const AS_INSTALL_BASH =
  'curl -sk https://arthas.aliyun.com/arthas-boot.jar -o ~/.arthas-boot.jar  ' +
  '&& echo "alias as.sh=\'java -jar ~/.arthas-boot.jar --repo-mirror aliyun --use-http 2>&1\'" >> ~/.bashrc ' +
  '&& source ~/.bashrc && echo "source ~/.bashrc" >> ~/.bash_profile && source ~/.bash_profile';

/** 安装脚本：as.sh */
export const AS_INSTALL_AS_SH = 'curl -L "https://arthas.aliyun.com/as.sh" >as.sh;chmod a+x as.sh;./as.sh';

/** 默认条件表达式 */
export const DEFAULT_CONDITION_EXPRESS = "'1==1'";

export const DEFAULT_SKIP_JDK_FALSE = '--skipJDKMethod false';

/** ognl 内部类分隔符 */
export const OGNL_INNER_CLASS_SEPARATOR = '$';
