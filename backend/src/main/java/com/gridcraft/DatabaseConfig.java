package com.gridcraft;
import java.io.IOException;
import java.nio.file.*;
import javax.sql.DataSource;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteDataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;
@Configuration
class DatabaseConfig {
    @Bean DataSource dataSource(@Value("${gridcraft.database}") String database) throws IOException {
        Path file=Path.of(database).toAbsolutePath().normalize(); Files.createDirectories(file.getParent());
        SQLiteConfig config=new SQLiteConfig(); config.enforceForeignKeys(true); config.setBusyTimeout(5000);
        config.setJournalMode(SQLiteConfig.JournalMode.WAL);
        SQLiteDataSource source=new SQLiteDataSource(config); source.setUrl("jdbc:sqlite:"+file);
        return source;
    }
    @Bean PlatformTransactionManager transactionManager(DataSource source) { return new DataSourceTransactionManager(source); }
    @Bean JdbcTemplate jdbcTemplate(DataSource source) { return new JdbcTemplate(source); }
}
